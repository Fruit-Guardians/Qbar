// Test-only adapter: the same curlconverter tokenizer uses its installed native
// tree-sitter runtime in Node. Browser builds keep the actual WASM webParser.
const Parser = require('tree-sitter')
const Bash = require('tree-sitter-bash')
const parser = new Parser()
parser.setLanguage(Bash)
module.exports = Promise.resolve(parser)
