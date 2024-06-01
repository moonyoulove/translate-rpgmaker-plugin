import shell from "shelljs";
import { program } from "commander";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
program
    .requiredOption("--start-js <path>", "javascript file to bundle")
    .requiredOption("--app-name <name>", "executable app name")
    .option("--build-dir <dir>", "build folder", "./build")
    .option("--node-path <path>", "custom node binary path to copy")
    .parse();
const { startJs, buildDir, appName, nodePath } = program.opts();
const platform = { win32: "windows", darwin: "macos" }[process.platform] ?? "linux";
const spinner = ora();

spinner.text = "Bundle javascript file";
await exec(
    `esbuild ${startJs} --bundle --platform=node --outfile=${buildDir}/bundled-${path.basename(
        startJs
    )}`
);

spinner.text = "Create configuration file";
const config = {
    main: `${buildDir}/bundled-${path.basename(startJs)}`,
    output: `${buildDir}/sea-prep.blob`,
    disableExperimentalSEAWarning: true,
};
await write(`${buildDir}/sea-config.json`, JSON.stringify(config));

spinner.text = "Generating sea-prep.blob";
await exec(`node --experimental-sea-config ${buildDir}/sea-config.json`);

spinner.text = "Copying node binary";
await copy(
    nodePath ?? process.execPath,
    `${buildDir}/${appName}${platform === "windows" ? ".exe" : ""}`
);

spinner.text = "Removing signature";
if (platform === "windows" && shell.which("signtool")) {
    await exec(`signtool remove /s ${buildDir}/${appName}.exe`);
} else if (platform === "macos") {
    await exec(`codesign --remove-signature ${buildDir}/${appName}`);
}

spinner.text = "Injecting sea-prep.blob";
if (platform === "windows") {
    await exec(
        `postject ${buildDir}/${appName}.exe NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite`
    );
} else if (platform === "macos") {
    await exec(
        `npx postject ${buildDir}/${appName} NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA --overwrite`
    );
} else {
    await exec(
        `npx postject ${buildDir}/${appName} NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite`
    );
}

spinner.text = "Signing binary";
if (platform === "macos") {
    await exec(`codesign --sign - ${buildDir}/${appName}`);
}

spinner.succeed("All done!");

async function exec(command) {
    spinner.start();
    const [code, stdout, stderr] = await new Promise(resolve => {
        shell.exec(command, { silent: true, async: true }, (...args) => resolve(args));
    });
    if (code !== 0) {
        spinner.fail();
        throw new Error(stderr || stdout);
    } else {
        spinner.succeed();
        return stdout;
    }
}

async function copy(src, dest) {
    spinner.start();
    const error = await new Promise(resolve => {
        fs.copyFile(src, dest, resolve);
    });
    if (error) {
        spinner.fail();
        throw error;
    } else {
        spinner.succeed();
    }
}

async function write(file, data) {
    spinner.start();
    const error = await new Promise(resolve => {
        fs.writeFile(file, data, resolve);
    });
    if (error) {
        spinner.fail();
        throw error;
    } else {
        spinner.succeed();
    }
}
