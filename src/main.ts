import fs from "fs";
import { tokenize } from "./lexer";
import { log } from "console";
import { TokenType } from "./common";
import assert from "node:assert/strict";
import { parse } from "./parser";
import { Interpreter } from "./visitor";
import { Program } from "./ast";

let original = "";
//  original = fs.readFileSync(__dirname + "/../tests/loop.txt", "utf8");
 original = fs.readFileSync(__dirname + "/../tests/t1.txt", "utf8");

// 1. add default stuff
// original = "\\version{1}\n\\prefix{\\}\n\\config{files}{true}\n\\config{net}{true}\n\\config{env}{true}\n\\config{js}{true}\n" + original;

// original += "\n\\halt";

log("===== content: =====");
log(original);

// 2. lexer (Tokens)
log("===== tokenize: =====");
const tokenized = tokenize(original);
log(tokenized);

const reconstructedFromLexer = tokenized.map((t) => t.value).join("");
assert.strictEqual(original, reconstructedFromLexer);
log("lexer verified ✅");

// 3. parser (AST)
log("===== parse: =====");
const ast = parse(tokenized) as Program;
const treeify = require("./utils/treeify");
treeify.asLines(ast, true, false, log);
 
// 4. interpreter (Execute)
log("===== interpret: =====");
const visitor = new Interpreter();
const generated = ast.accept(visitor);
log(generated);
log("----------------------")

// ?. Validator/Rewriter (check enabled/disabled features)
// ?. Optimizer (dead code elimination, constant folding, etc.)
