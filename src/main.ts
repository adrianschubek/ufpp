import fs from "fs";
import { tokenize } from "./lexer";
import { log } from "console";
import { TokenType } from "./common";
import assert from "node:assert/strict";
import { parse } from "./parser";

// let original = fs.readFileSync(__dirname + "/../tests/loop.txt", "utf8");
let original = fs.readFileSync(__dirname + "/../tests/t1.txt", "utf8");

// 1. add default stuff
// original = "\\version{1}\n\\prefix{\\}\n\\config{files}{true}\n\\config{net}{true}\n\\config{env}{true}\n\\config{js}{true}\n" + original;

// original += "\n\\halt";

log("===== content: =====");
log(original);

// 2. lexer (Tokens)
log("===== tokenize: =====");
const tokenized = tokenize(original);
log(tokenized);

log("lexer verified ✅");
const reconstructedFromLexer = tokenized.map((t) => t.value).join("");
assert.strictEqual(original, reconstructedFromLexer);

// 3. parser (AST)
log("===== parse: =====");
const parsed = parse(tokenized);
const treeify = require("./utils/treeify");
treeify.asLines(parsed, true, false, log);

// 4. Validator/Rewriter (check enabled/disabled features)

// 5. interpreter (Execute)

// ?. Optimizer (dead code elimination, constant folding, etc.)
