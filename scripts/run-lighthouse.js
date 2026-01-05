import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import http from 'http';

const checkServer = () => new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3000', (res) => {
        if (res.statusCode === 200) resolve(true);
        else reject(new Error(`Server responded with status: ${res.statusCode}`));
    });
    req.on('error', (err) => reject(err));
    req.end();
});

const waitForServer = async (maxAttempts = 30, delay = 1000) => {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await checkServer();
            console.log('Server is up!');
            return;
        } catch (e) {
            console.log(`Waiting for server... (${i + 1}/${maxAttempts})`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error('Server failed to start within timeout');
};

(async () => {
    // Start the server
    console.log('Starting server...');
    const server = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true, detached: true });

    try {
        // Wait for server to start
        await waitForServer();

        const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
        const options = { logLevel: 'info', output: 'html', onlyCategories: ['performance'], port: chrome.port };

        // Lighthouse execution
        const runnerResult = await lighthouse('http://localhost:3000', options);

        // .report is the HTML report as a string
        const reportHtml = runnerResult.report;

        if (!fs.existsSync('reports')) {
            fs.mkdirSync('reports');
        }

        fs.writeFileSync('reports/lighthouse.html', reportHtml);

        // .lhr is the Lighthouse Result as a JS object
        console.log('Report is done for', runnerResult.lhr.finalUrl);
        console.log('Performance score was', runnerResult.lhr.categories.performance.score * 100);

        await chrome.kill();

    } catch (error) {
        console.error('Lighthouse run failed:', error);
        process.exit(1);
    } finally {
        // Kill server group
        try {
            if (server.pid) {
                process.kill(-server.pid);
            }
        } catch (e) {
            // ignore
        }
        process.exit(0);
    }
})();
