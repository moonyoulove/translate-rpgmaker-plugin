#!/usr/bin/env node
import translatePlugin from "./lib.js";
import { program, Option } from "commander";

program
    .name("translate")
    .argument("<plugin>", "plugin path")
    .action((plugin, options) => (options.plugin = plugin))
    .requiredOption("--src <lang>", "source language")
    .requiredOption("--target <lang>", "target language")
    .option("--txt <path>", "translated text file path to import", "")
    .option("--output <dir>", "output Directory", "./")
    .addOption(
        new Option("--engine <type>", "translate engine type")
            .default("manual")
            .choices(["deepl", "azure", "google", "manual"])
    )
    .option("--split-text", "for translate large amounts of text, but be aware of API quotas")
    .addHelpText(
        "after",
        `
Translate engine types:
  deepl
    needs DEEPL_KEY in env vars
  azure
    needs AZURE_KEY and AZURE_REGION in env vars
  google
    use $ gcloud auth application-default login
  manual
    will generate txt file for manual translation (ex. website version of google translate, microsoft word, etc..)`
    )
    .parse();
const options = program.opts();
translatePlugin({
    pluginPath: options.plugin,
    srcLang: options.src,
    targetLang: options.target /* TODO multiple language */,
    outputDir: options.output,
    engineType: options.engine,
    txtPath: options.txt,
    splitText: options.splitText,
});
