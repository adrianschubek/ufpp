import { log } from "console";
import { TokenType, err } from "./common";
import type { Token } from "./common";

const ROW_OFFSET = 0;
const INDEX_OFFSET = 0;
const PREFIX = "\\";
const ARG_START = "{";
const ARG_END = "}";
const PARAM_START = "[";
const PARAM_ASSIGN = "=";
const PARAM_SEP = ",";
const PARAM_END = "]";
const EVAL_START = "`";
const EVAL_END = "`";

export interface TokenizerConfig {
  prefix: string;
  argStart: string;
  argEnd: string;
  paramStart: string;
  paramAssign: string;
  paramSep: string;
  paramEnd: string;
  evalStart: string;
  evalEnd: string;
}

export function tokenize(
  input: string,
  config: TokenizerConfig = {
    prefix: PREFIX,
    argStart: ARG_START,
    argEnd: ARG_END,
    paramStart: PARAM_START,
    paramAssign: PARAM_ASSIGN,
    paramSep: PARAM_SEP,
    paramEnd: PARAM_END,
    evalStart: EVAL_START,
    evalEnd: EVAL_END,
  }
): Token[] {
  let row = 0 - ROW_OFFSET; // offset for inserted statements
  let col = 0;
  let index = 0;
  const tokens: Token[] = [];

  // track position for col and row index
  function track(consumed: string) {
    for (const char of consumed) {
      if (char === "\n") {
        // better handling fro \r\n needed?
        row++;
        col = 0;
      } else {
        col++;
      }
    }
  }

  function option(expected: string): boolean {
    return input.slice(index, index + expected.length) === expected;
  }

  function optionAndPredicate(expected: string, predicate: (char: string) => boolean): boolean {
    return input.slice(index, index + expected.length) === expected && predicate(input[index + expected.length]);
  }

  function consume(expected: string) {
    if (input.slice(index, index + expected.length) === expected) {
      index += expected.length;
      track(expected);
    } else {
      err(`Expected "${expected}" got "${input.slice(index, index + expected.length)}"`, row, col);
    }
  }

  function consumeWhile(predicate: (char: string) => boolean): string {
    let result = "";
    while (predicate(input[index]) && index < input.length) {
      result += input[index];
      track(input[index]);
      index++;
    }
    return result;
  }

  function consumeUntil(predicate: (char: string) => boolean): string {
    let result = "";
    while (!predicate(input[index]) && index < input.length) {
      result += input[index];
      track(input[index]);
      index++;
    }
    return result;
  }

  function lexCommand() {
    const startRow = row;
    const startCol = col;
    tokens.push({ type: TokenType.T_PREFIX, value: config.prefix, row, col });
    consume(config.prefix);
    const command = consumeWhile(
      (char) => char !== config.paramStart && char !== config.argStart && char !== " " && char !== "\n" && char !== "\t" && char !== "\r"
    );
    tokens.push({ type: TokenType.T_CMD, value: command, row: startRow, col: startCol });

    // lexKeyValue \foo[a=b,c=\width]{...}...
    if (option(config.paramStart)) {
      consume(config.paramStart);
      tokens.push({ type: TokenType.T_PARAM_START, value: config.paramStart, row, col });

      while (index < input.length && !option(config.paramEnd)) {
        const key = consumeUntil((char) => char === config.paramAssign || char === config.paramSep || char === config.paramEnd);
        tokens.push({ type: TokenType.T_PARAM_KEY, value: key, row, col });

        if (option(config.paramAssign)) {
          consume(config.paramAssign);
          tokens.push({ type: TokenType.T_PARAM_ASSIGN, value: config.paramAssign, row, col });
          const value = consumeUntil((char) => char === config.paramSep || char === config.paramEnd);
          // tokens.push({ type: TokenType.T_PARAM, value, row, col });

          // tokenize the value
          const valueTokens = tokenize(value, config);
          for (const token of valueTokens) {
            token.row += row; // Adjust the row for nested tokens
            token.col += col; // Adjust the col for nested tokens
            tokens.push(token);
          }
        }

        if (option(config.paramSep)) {
          consume(config.paramSep);
          tokens.push({ type: TokenType.T_PARAM_SEP, value: config.paramSep, row, col });
        }
      }

      consume(config.paramEnd);
      tokens.push({ type: TokenType.T_PARAM_END, value: config.paramEnd, row, col });
    }

    while (option(config.argStart)) {
      const argStartRow = row;
      const argStartCol = col;
      consume(config.argStart);
      tokens.push({ type: TokenType.T_ARG_START, value: config.argStart, row: argStartRow, col: argStartCol });

      let nestedLevel = 1;
      let group = "";

      let groupStartRow = row;
      let groupStartCol = col;

      while (nestedLevel > 0 && index < input.length) {
        if (option(config.argStart)) {
          nestedLevel++;
          group += config.argStart;
          track(config.argStart);
          index++;
        } else if (option(config.argEnd)) {
          nestedLevel--;
          if (nestedLevel > 0) {
            group += config.argEnd;
          }
          track(config.argEnd);
          index++;
        } else if (option(config.prefix)) {
          group += config.prefix;
          track(config.prefix);
          index++;
          group += consumeWhile((char) => char !== config.argStart && char !== config.argEnd && char !== config.prefix);
        } else {
          group += input[index];
          track(input[index]);
          index++;
        }
      }

      if (nestedLevel > 0) {
        err(`Unbalanced braces in command arguments`, argStartRow, argStartCol);
      }

      // Recursively tokenize the group for tracking row and col
      const groupTokens = tokenize(group, config); // recursion
      for (const token of groupTokens) {
        token.row += groupStartRow; // Adjust the row for nested tokens
        token.col += groupStartCol; // Adjust the col for nested tokens
        tokens.push(token);
      }

      //  tokens.push(...tokenize(group));
      tokens.push({ type: TokenType.T_ARG_END, value: config.argEnd, row, col });
    }
  }

  function lexRaw() {
    const startRow = row;
    const startCol = col;
    const start = index;
    while (index < input.length && !optionAndPredicate(config.prefix, validFunctionStart) /* && !option(config.prefix) */) {
      track(input[index]);
      index++;
    }
    tokens.push({ type: TokenType.T_RAW, value: input.slice(start, index), row: startRow, col: startCol });
  }

  function lexEval() {
    const startRow = row;
    const startCol = col;
    const start = index;
    consume(config.evalStart);
    while (index < input.length && !option(config.evalEnd)) {
      track(input[index]);
      index++;
    }
    consume(config.evalEnd);
    tokens.push({ type: TokenType.T_EVAL, value: input.slice(start, index), row: startRow, col: startCol });
  }
  //  "\" + non whitespace char
  const validFunctionStart = (nextChar: string) =>
    nextChar !== undefined &&
    nextChar !== "" &&
    nextChar !== " " &&
    nextChar !== "\n" &&
    nextChar !== "\t" &&
    nextChar !== "\r" &&
    nextChar !== config.prefix; /* allow escape with double prefix */

  while (index < input.length) {
    if (optionAndPredicate(config.prefix, validFunctionStart)) {
      // if (option(config.prefix)) {
      lexCommand();
    } else if (option(config.evalStart)) {
      lexEval();
    } else {
      lexRaw();
    }
  }

  return tokens;
}
