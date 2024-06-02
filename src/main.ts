import fs from "fs";
import { tokenize } from "./lexer";
import { log } from "console";
import { parse } from "./parser";
import { interpret } from "./visitor";
import { preprocess } from "./preprocessor";
import chalk from "chalk";
import { analyze } from "./analyzer";

let original = "";
//  original = fs.readFileSync(__dirname + "/../tests/loop.txt", "utf8");
//  original = fs.readFileSync(__dirname + "/../tests/t1.txt", "utf8");
// original = fs.readFileSync(__dirname + "/../tests/t3.php", "utf8");
original = fs.readFileSync(__dirname + "/../tests/t4.txt", "utf8");

// \rawfile{path} imports the file, just copo/pastes the file content, no pipeline
// allow file importsw: \file{name} just copo/pastes the file content
// \use{realtivePathOrURL} imports the file, usign this pipeline and executes it
// pro: own \\\utppp[] block
//   no easy. In Interperter for \file{} just do the pipeline (except interpret) preprocess>tokenize>parse

// read cli: -q quiet? (print debug)

const pj = require("../package.json");
console.log(chalk.yellowBright(chalk.bold(`🚀 utpp ${pj.version} `)));

// log("===== content: =====");
// log(original);

// 1. preprocessor (Meta Config)
log("===== preprocess: =====");
const [input, config] = preprocess(original);

console.log("with config: ", config);

// 2. lexer (Tokens)
log("===== tokenize: =====");
const tokenized = tokenize(input, config);
log(tokenized);

// const reconstructedFromLexer = tokenized.map((t) => t.value).join("");
// assert.strictEqual(original, reconstructedFromLexer);
// log("lexer verified ✅"); // doesnt work when metaconfig used

// TODO: allow export/import (serialize) AST for faster executing

// 3. parser (AST)
log("===== parse: =====");
const ast = parse(tokenized);
const treeify = require("./utils/treeify"); // debug
treeify.asLines(ast, true, false, log); // debug

// 4. AST Analyzer (imports, verify enabled/disabled features)
log("===== analyze: =====");
const program = analyze(ast, config);

// 5. interpreter (Execute on complete resolved AST)
log("===== interpret: =====");
const generated = interpret(program);
log(generated);
log("----------------------");

// ?. Validator/Rewriter (check enabled/disabled features)
// ?. Optimizer (dead code elimination, constant folding, etc.)

// maybe IR-Representation SSA form optimize...
