## Install
Download source code from github and go to project directory run this command:
```shell
npm install
```
Or install by npm directly:
```shell
npm install https://github.com/moonyoulove/translate-rpgmaker-plugin.git
```
Or download single executable app from [release page](https://github.com/moonyoulove/translate-rpgmaker-plugin/releases/latest).

## Config
Go to project directory, rename *.env.example* to *.env* and fill it on demand.
```shell
DEEPL_KEY=
AZURE_KEY=
AZURE_REGION=
```
Get key from:
1. [DeepL](https://developers.deepl.com/docs/getting-started/auth#authentication)
3. [Azure Text Translation](https://learn.microsoft.com/en-us/azure/ai-services/translator/create-translator-resource#get-your-authentication-keys-and-endpoint)
3. [Google Cloud Translation](https://cloud.google.com/translate/docs/authentication#authn-how-to)

Or just copy text to existing translator manually.

## Usage
Use this command in project directory:
```
node ./translate.js [options] <plugin>
```
Or use use this command in anywhere:
```
npx translate-rpgmaker-plugin [options] <plugin>
```
Or use single executable app:
```
./translate-rm [options] <plugin> 
```
* On Windows:
  ```
  .\translate-rm.exe [options] <plugin> 
  ```

## Options
```
Arguments:
  plugin           plugin path

Options:
  --src <lang>     source language
  --target <lang>  target language
  --txt <path>     translated text file path to import (default: "")
  --output <dir>   output Directory (default: "./")
  --engine <type>  translate engine type (choices: "deepl", "azure", "google", "manual", default: "manual")
  --split-text     for translate large amounts of text, but be aware of API quotas (default: false)
  -h, --help       display help for command

Translate engine types:
  deepl
    needs DEEPL_KEY in env vars
  azure
    needs AZURE_KEY and AZURE_REGION in env vars
  google
    use $ gcloud auth application-default login
  manual
    will generate txt file for manual translation (ex. website version of google translate, microsoft word, etc..)
```
## Programming
```js
import translatePlugin from "translate-rpgmaker-plugin";
const options = {
    pluginPath: "path/to/plugin/xxx.js",
    srcLang: "en",
    targetLang: "zh",
    outputDir: "path/to/output", // default: "./"
    engineType: "deepl", // default: "manual"
    txtPath: "path/to/import/xxx.txt", // default: ""
    splitText: false, // default: false
};
await translatePlugin(options);
```
