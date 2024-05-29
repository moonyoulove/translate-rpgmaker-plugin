import shell from "shelljs";
import { program } from "commander";
import ora from "ora";
const platform = { win32: "windows", darwin: "macos" }[process.platform] ?? "linux";
const spinner = ora();
program.requiredOption("--app-name <name>").option("--build-dir <dir>", null, "./build").parse();
const { buildDir, appName } = program.opts();

spinner.text = "Bundle translate.js";
await exec(
    `esbuild ./translate.js --bundle --platform=node --outfile=${buildDir}/bundled-translate.js`
);

spinner.text = "Generating sea-prep.blob";
await exec(`node --experimental-sea-config sea-config.json`);

spinner.text = "Copying node binary";
if (platform === "windows") {
    await exec(
        `node -e "require('fs').copyFileSync(process.execPath, '${buildDir}/${appName}.exe')"`
    );
} else {
    await exec(`cp $(command -v node) ${buildDir}/${appName}`);
}

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
