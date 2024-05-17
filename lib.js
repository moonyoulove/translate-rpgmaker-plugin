import fs from "node:fs";
import { JSDOM } from "jsdom";
import "dotenv/config";
import { Buffer } from "node:buffer";
import path from "node:path";

async function translatePlugin(options) {
    options = parseOptions(options);
    const pluginText = fs.readFileSync(options.pluginPath, { encoding: "utf-8" });
    const plugin = parsePlugin(pluginText);
    const { locations, textToTranslate } = makeTranslateList(plugin);
    const translatedText = await translateText(textToTranslate, options);
    // const translatedText = translateFakeText(textToTranslate, options);
    if (options.engineType === "manual" && !options.txtPath) {
        // Generate text files instead of plugins
        return;
    }
    applyTranslation(plugin, locations, translatedText);
    const translatedPlugin = generateOutput(plugin, options.targetLang);
    const outputPath = path.join(options.outputDir, path.basename(options.pluginPath));
    fs.writeFileSync(outputPath, translatedPlugin);
    console.log("Generated plugin: " + path.resolve(outputPath));
}

function parseOptions(options) {
    return {
        pluginPath: options.pluginPath,
        srcLang: options.srcLang,
        targetLang: options.targetLang,
        outputDir: options.outputDir ?? "./",
        engineType: options.engineType ?? "manual",
        txtPath: options.txtPath ?? "",
    };
}

async function translateTextByGoogle(text, { srcLang, targetLang }) {
    const { Translate } = (await import("@google-cloud/translate")).v2;
    const translate = new Translate();
    const option = {
        from: srcLang,
        to: targetLang,
        format: "html",
    };
    return (await translate.translate(text, option))[0];
}

async function translateTextByDeepl(text, { srcLang, targetLang }) {
    const deepl = await import("deepl-node");
    const authKey = process.env.DEEPL_KEY;
    const translator = new deepl.Translator(authKey);
    const result = await translator.translateText(text, srcLang, targetLang, {
        tagHandling: "html",
    });
    return result.text;
}

async function translateTextByAzure(text, { srcLang, targetLang }) {
    const TextTranslation = (await import("@azure-rest/ai-translation-text")).default;
    const TextTranslationClient = TextTranslation.default;
    const endpoint = "https://api.cognitive.microsofttranslator.com";
    const apiKey = process.env.AZURE_KEY;
    const region = process.env.AZURE_REGION;
    const translateCredential = {
        key: apiKey,
        region,
    };
    const translationClient = TextTranslationClient(endpoint, translateCredential);
    const requestOptions = {
        body: [{ text }],
        queryParameters: {
            to: targetLang,
            from: srcLang,
            textType: "html",
        },
    };
    const translateResponse = await translationClient.path("/translate").post(requestOptions);
    const translation = translateResponse.body[0].translations[0];
    return translation.text;
}

function translateTextByManual(text, { pluginPath, outputDir, txtPath }) {
    if (txtPath) {
        return fs.readFileSync(txtPath, { encoding: "utf-8" });
    } else {
        const fileName = path.basename(pluginPath, path.extname(pluginPath));
        const filePath = path.format({ dir: outputDir, name: fileName, ext: "txt" });
        fs.writeFileSync(filePath, text);
        console.log("Generated text file: " + path.resolve(filePath));
        return null;
    }
}

async function translateFakeText(text, options) {
    return text.replaceAll(/<li>/g, "$&[Translated]: ");
}

function getTranslateFunc(engineType) {
    switch (engineType) {
        case "deepl":
            return translateTextByDeepl;
        case "google":
            return translateTextByGoogle;
        case "azure":
            return translateTextByAzure;
        case "manual":
            return translateTextByManual;
    }
}

async function translateText(text, options) {
    const maxSize = 100000;
    const splitted = checkSplitText(text, maxSize) ? splitText(text, maxSize) : [text];
    const translateFunc = getTranslateFunc(options.engineType);
    return await Promise.all(splitted.map(text => translateFunc(text, options)));
}

function checkSplitText(text, maxSize, options) {
    const size = Buffer.byteLength(encodeURIComponent(text));
    if (size > maxSize) {
        if (!options.splitText) {
            throw new Error(
                'To translate large amounts of text, set "splitText"(--split-text in cli) option to true. Note that this will consume a large amount of API quota.'
            );
        }
        return true;
    }
    return false;
}

function splitText(text, maxSize) {
    const splitted = [];
    let size = 0;
    for (let i = 0; i < text.length; i++) {
        const charSize = Buffer.byteLength(encodeURIComponent(text[i]));
        size += charSize;
        if (size > maxSize) {
            const index = findTagEnd(text, i) ?? i;
            splitted.push(text.slice(0, index));
            text = text.slice(index);
            i = 0;
            size = 0;
        }
    }
    splitted.push(text);
    return splitted;
}

function findTagEnd(text, position) {
    const index = text.lastIndexOf("</li>", position);
    return index > 0 ? index + "</li>".length : null;
}

function parsePlugin(pluginText) {
    const plugin = {
        blocks: [],
        comments: {},
        text: pluginText,
    };
    /*~struct~XXX:
     * @param xxx
     * @text yyy
     */
    // match "/*~struct~XXX:" or "/*:" not "/*:en"
    const commentStartRegex = /\/\*.*:\W/gm;
    // match "*/"
    const commentEndRegex = /\*\//gm;
    for (const commentStart of execRegex(commentStartRegex, plugin.text)) {
        plugin.blocks.push(plugin.text.slice(commentEndRegex.lastIndex, commentStart.index));
        setRegexIndex(commentEndRegex, commentStartRegex.lastIndex);
        const commentEnd = commentEndRegex.exec(plugin.text);
        if (commentEnd) {
            const text = plugin.text.slice(commentStart.index, commentEndRegex.lastIndex);
            plugin.blocks.push(text);
            const index = plugin.blocks.length - 1;
            plugin.comments[index] = parseComment(text);
            setRegexIndex(commentStartRegex, commentEndRegex.lastIndex);
        } else {
            setRegexIndex(commentEndRegex, commentStart.index);
        }
    }
    plugin.blocks.push(plugin.text.slice(commentEndRegex.lastIndex));
    return plugin;
}

function* execRegex(regex, str) {
    if (!regex.global) {
        throw new Error("Regex must be global");
    }
    let result = regex.exec(str);
    while (result) {
        yield result;
        result = regex.exec(str);
    }
}

function setRegexIndex(regex, index) {
    regex.lastIndex = index;
}

function previewBlocks(blocks, isObj = true, size = 20) {
    console.log(
        Object.values(blocks).map(text => {
            text = isObj ? text.text : text;
            let preview = "";
            const front = text.slice(0, size);
            preview += front;
            if (text.length > size * 2) {
                const middle = `... more ${text.length - size * 2} characters ...`;
                const back = text.slice(-size);
                preview += middle + back;
            } else if (text.length > size) {
                const middle = `... more ${text.length - size} characters`;
                preview += middle;
            }
            return preview;
        })
    );
}

function parseComment(commentText) {
    const comment = {
        text: commentText,
        blocks: [],
        params: {},
    };
    /*:
     * @param xxx
     * @text yyy
     */
    // match " * @param "
    const params = Array.from(comment.text.matchAll(/\r?\n \* @\w+\s/g));
    let start = 0;
    const ignoreParams = { "@option": [] };
    for (let j = 0; j < params.length; j++) {
        const param = params[j];
        if (param[0].match(/@param|@arg/)) {
            removeIgnoredParams(comment, ignoreParams);
        } else if (param[0].match(/@value/)) {
            ignoreParams["@option"].pop();
        } else if (param[0].match(/@desc|@plugindesc|@help|@text|@option/)) {
            const valueStart = param.index + param[0].length;
            const valueEnd = params[j + 1]?.index || comment.text.length;
            const value = comment.text.slice(valueStart, valueEnd);
            comment.blocks.push(comment.text.slice(start, valueStart));
            comment.blocks.push(value);
            start = valueEnd;
            const index = comment.blocks.length - 1;
            comment.params[index] = {
                text: value,
                translated: "",
            };
            if (param[0].match(/@option/)) {
                ignoreParams["@option"].push(index);
            }
        }
    }
    comment.blocks.push(comment.text.slice(start));
    removeIgnoredParams(comment, ignoreParams);
    return comment;
}

function removeIgnoredParams(comment, ignoreParams) {
    // Remove @option params which are not followed by @value
    for (const name in ignoreParams) {
        ignoreParams[name].forEach(index => delete comment.params[index]);
        ignoreParams[name] = [];
    }
}

function makeTranslateList(plugin) {
    const document = new JSDOM().window.document;
    const locations = [];
    for (const commentIndex in plugin.comments) {
        const comment = plugin.comments[commentIndex];
        for (const paramIndex in comment.params) {
            const param = comment.params[paramIndex];
            locations.push({ commentIndex, paramIndex });
            const li = document.createElement("li");
            /*:
             * @param xxx
             * @text yyy
             */
            // match " * "
            li.innerHTML = param.text.replaceAll(/\r?\n \* /g, "<br>");
            document.body.appendChild(li);
        }
    }
    const textToTranslate = document.body.innerHTML;
    return { locations, textToTranslate };
}

function applyTranslation(plugin, list, text) {
    const document = new JSDOM().window.document;
    document.body.innerHTML = text;
    document.querySelectorAll("li").forEach((li, i) => {
        li.querySelectorAll("br").forEach(br => br.replaceWith(document.createTextNode("\n * ")));
        const translated = li.textContent;
        const { commentIndex, paramIndex } = list[i];
        plugin.comments[commentIndex].params[paramIndex].translated = translated;
    });
}

function generateOutput(plugin, targetLang) {
    let pluginText = "";
    for (let i = 0; i < plugin.blocks.length; i++) {
        pluginText += plugin.blocks[i];
        if (i in plugin.comments) {
            const comment = plugin.comments[i];
            let commentText = "";
            for (let j = 0; j < comment.blocks.length; j++) {
                commentText += comment.params[j]?.translated ?? comment.blocks[j];
            }
            /*:
             * @param xxx
             * @text yyy
             */
            // match "/*:"
            pluginText += "\n" + commentText.replace(/^\/\*.*:/m, `$&${targetLang}`);
        }
    }
    return pluginText;
}

export default translatePlugin;
