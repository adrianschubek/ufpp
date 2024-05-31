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
const EVAL_END= "`";

export function tokenize(input: string): Token[] {
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

  function consume(expected: string) {
    if (input.slice(index, index + expected.length) === expected) {
      index += expected.length;
      track(expected);
    } else {
      log(input);
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
    tokens.push({ type: TokenType.T_PREFIX, value: PREFIX, row, col });
    consume(PREFIX);
    const command = consumeWhile(
      (char) => char !== PARAM_START && char !== ARG_START && char !== " " && char !== "\n" && char !== "\t" && char !== "\r"
    );
    tokens.push({ type: TokenType.T_CMD, value: command, row: startRow, col: startCol });

    // lexKeyValue \foo[a=b,c=\width]{...}...
    if (option(PARAM_START)) {
      consume(PARAM_START);
      tokens.push({ type: TokenType.T_PARAM_START, value: PARAM_START, row, col });

      while (index < input.length && !option(PARAM_END)) {
        const key = consumeUntil((char) => char === PARAM_ASSIGN || char === PARAM_SEP || char === PARAM_END);
        tokens.push({ type: TokenType.T_PARAM_KEY, value: key, row, col });

        if (option(PARAM_ASSIGN)) {
          consume(PARAM_ASSIGN);
          tokens.push({ type: TokenType.T_PARAM_ASSIGN, value: PARAM_ASSIGN, row, col });
          const value = consumeUntil((char) => char === PARAM_SEP || char === PARAM_END);
          // tokens.push({ type: TokenType.T_PARAM, value, row, col });

          // tokenize the value
          const valueTokens = tokenize(value);
          for (const token of valueTokens) {
            token.row += row; // Adjust the row for nested tokens
            token.col += col; // Adjust the col for nested tokens
            tokens.push(token);
          }
        }

        if (option(PARAM_SEP)) {
          consume(PARAM_SEP);
          tokens.push({ type: TokenType.T_PARAM_SEP, value: PARAM_SEP, row, col });
        }
      }

      consume(PARAM_END);
      tokens.push({ type: TokenType.T_PARAM_END, value: PARAM_END, row, col });
    }

    while (option(ARG_START)) {
      const argStartRow = row;
      const argStartCol = col;
      consume(ARG_START);
      tokens.push({ type: TokenType.T_ARG_START, value: ARG_START, row: argStartRow, col: argStartCol });

      let nestedLevel = 1;
      let group = "";

      let groupStartRow = row;
      let groupStartCol = col;

      while (nestedLevel > 0 && index < input.length) {
        if (option(ARG_START)) {
          nestedLevel++;
          group += ARG_START;
          track(ARG_START);
          index++;
        } else if (option(ARG_END)) {
          nestedLevel--;
          if (nestedLevel > 0) {
            group += ARG_END;
          }
          track(ARG_END);
          index++;
        } else if (option(PREFIX)) {
          group += PREFIX;
          track(PREFIX);
          index++;
          group += consumeWhile((char) => char !== ARG_START && char !== ARG_END && char !== PREFIX);
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
      const groupTokens = tokenize(group); // recursion
      for (const token of groupTokens) {
        token.row += groupStartRow; // Adjust the row for nested tokens
        token.col += groupStartCol; // Adjust the col for nested tokens
        tokens.push(token);
      }

      //  tokens.push(...tokenize(group));
      tokens.push({ type: TokenType.T_ARG_END, value: ARG_END, row, col });
    }
  }

  function lexRaw() {
    const startRow = row;
    const startCol = col;
    const start = index;
    while (index < input.length && !option(PREFIX)) {
      track(input[index]);
      index++;
    }
    tokens.push({ type: TokenType.T_RAW, value: input.slice(start, index), row: startRow, col: startCol });
  }

  function lexEval() {
    const startRow = row;
    const startCol = col;
    const start = index;
    consume(EVAL_START);
    while (index < input.length && !option(EVAL_END)) {
      track(input[index]);
      index++;
    }
    consume(EVAL_END);
    tokens.push({ type: TokenType.T_EVAL, value: input.slice(start, index), row: startRow, col: startCol });
  }

  while (index < input.length) {
    if (option(PREFIX)) {
      lexCommand();
    } else if (option(EVAL_START)) {
      lexEval();
    } else {
      lexRaw();
    }
  }

  return tokens;
}
