#!/usr/bin/env node

// HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\AmdPPM\Start
// Change from 3 to 4 and restart

import { Registry } from 'rage-edit';
import { spawn } from "node:child_process";

const base = `HKLM\\SYSTEM\\CurrentControlSet\\Services\\AmdPPM`;
const shutdown = "shutdown";

try {
    const updated = await updateStart();
    if (updated) {
        try {
            const result = await setRestart();
            console.log(`result value is ${result}`);
        } catch (error) {
            console.log(`Error caught: ${error}`);
        }
    }
} catch (error) {
    console.log("Unable to access or update registry - check authorization", error);

}

async function updateStart() {
    const start = await Registry.get(base, 'Start') || 4;
    console.log(`Start value is ${start}`);
    let result = false;

    if (start === 3) {
        console.log(`Resetting start to disable service`);
        result = true;
        await Registry.set(base, 'Start', 4);
    }

    return result;
}

function setRestart() {
    const timeout = 120;
    const child = spawn(shutdown, ["/g", "/t", timeout]);
    let stdout = "";
    let stderr = "";

    if (child.stdout) {
        child.stdout.on('data', data => {
            stdout += data;
        })
    }

    if (child.stderr) {
        child.stderr.on('data', data => {
            stderr += data;
        })
    }

    const promise = new Promise((resolve, reject) => {
        child.on('error', reject);

        child.on('close', code => {
            if (stdout.length) {
                console.log(`stdout: ${stdout}`);
            }

            if (stderr.length) {
                console.log(`stderr: ${stderr}`);
            }

            if (code === 0) {
                resolve(stdout)
            } else {
                const err = new Error(`child exited with code ${code}`)
                err.code = code;
                err.stderr = stderr;
                err.stdout = stdout;
                reject(err);
            }
        });
    });

    promise.child = child;

    return promise;
}
