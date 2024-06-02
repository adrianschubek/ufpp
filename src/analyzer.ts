import path from "path";
import {
  ASTNode,
  CaseStatement,
  Comment,
  EvalStatement,
  ExecStatement,
  FileStatement,
  FunctionCall,
  FunctionDefinition,
  IfStatement,
  LoopStatement,
  MatchStatement,
  Params,
  Program,
  RawStatement,
  URLStatement,
  UseStatement,
} from "./ast";
import { Config, DefaultConfig, err as trueErr, rowcol, warn as trueWarn, info as trueInfo } from "./common";
import { Visitor } from "./visitor";
import { preprocess } from "./preprocessor";
import { tokenize } from "./lexer";
import { parse } from "./parser";
import fs from "fs";
import { spawnSync } from "child_process";
import crypto from "crypto";

export function analyze(node: Program, config: Config): Program {
  // Analyzing Visitor (imports, allow/disallow features)

  const anal = new Analyzer(node, config);
  node.accept(anal);
  return anal.root;
}

// Dependency Manager/Importer
export class Analyzer implements Visitor<void> {
  root: Program;
  config: Config;
  constructor(root: Program, config: Config) {
    this.config = config;
    this.root = root;
  }
  visitExecStatement(node: ExecStatement): void {
    node.command.accept(this);
  }

  //  set for each node type -> filename (+filepath)
  setFileNameIfNotAlreadySet(node: ASTNode) {
    if (node.fileName === undefined) node.fileName = this.config.fileName;
  }

  err = (msg: string, node: ASTNode) =>
    trueErr(msg, ...rowcol(node), node.fileName !== undefined ? { ...this.config, fileName: node.fileName } : this.config);
  warn = (msg: string, node: ASTNode) =>
    trueWarn(msg, ...rowcol(node), node.fileName !== undefined ? { ...this.config, fileName: node.fileName } : this.config);
  info = (msg: string, node: ASTNode) =>
    trueInfo(msg, ...rowcol(node), node.fileName !== undefined ? { ...this.config, fileName: node.fileName } : this.config);

  visitProgram(node: Program): void {
    this.setFileNameIfNotAlreadySet(node);
    node.body.forEach((n) => n.accept(this));
  }

  visitRaw(node: RawStatement): void {
    this.setFileNameIfNotAlreadySet(node);
  }

  visitFunctionCall(node: FunctionCall): void {
    this.setFileNameIfNotAlreadySet(node);
    node.args.forEach((n) => n.accept(this));
    node.params.accept(this);
  }

  visitFunctionDefinition(node: FunctionDefinition): void {
    this.setFileNameIfNotAlreadySet(node);
    node.body.accept(this);
    node.fnArgs.accept(this);
  }

  visitParams(node: Params): void {
    this.setFileNameIfNotAlreadySet(node);
    Object.values(node.kv).forEach((n) => n !== null && n.accept(this));
  }

  visitIfStatement(node: IfStatement): void {
    this.setFileNameIfNotAlreadySet(node);
    node.condition.accept(this);
    node.trueBranch.accept(this);
    node.falseBranch?.accept(this);
  }

  visitMatchStatement(node: MatchStatement): void {
    this.setFileNameIfNotAlreadySet(node);
    // Implement match statement analysis logic here
  }

  visitCaseStatement(node: CaseStatement): void {
    this.setFileNameIfNotAlreadySet(node);
    // Implement case statement analysis logic here
  }

  visitLoopStatement(node: LoopStatement): void {
    this.setFileNameIfNotAlreadySet(node);
    // Implement loop statement analysis logic here
  }

  visitURLStatement(node: URLStatement): void {
    this.setFileNameIfNotAlreadySet(node);
    // Implement URL statement analysis logic here
  }

  visitFileStatement(node: FileStatement): void {
    this.setFileNameIfNotAlreadySet(node);
    // if (this.config.files !== "true") warn("Reading files is disabled. Skipping code", ...rowcol(node));
  }

  visitUseStatement(node: UseStatement): void {
    this.setFileNameIfNotAlreadySet(node);
    if (this.config.eval !== "true") {
      this.warn("JavaScript evaluation is disabled. Skipping code", node);
      return;
    }
    // other \url,\file IGNORE. they are on demand in-place reads prints as-is without eval. do not eval
    let include: string = "";
    let fileContent: string = "";
    let hashInclude = "";
    try {
      include = ((node.code as Program).body[0] as RawStatement).value;
      hashInclude = ((node.hash as Program).body[0] as RawStatement).value;
    } catch (_) {}

    if (include === undefined || include === "" || hashInclude === undefined)
      this.err(
        `Invalid use statement syntax. Functions inside use statements are not allowed. Valid examples: ${this.config.prefix}use{pkg:foo}, ${this.config.prefix}use{file.utpp} or ${this.config.prefix}use{https://example.com}`,
        node
      );

    // parse params as default meta config to allow \use[prefix=#]{file.txt}
    let includeConfig: Partial<Config> = {};
    if (node.params !== undefined) {
      // throw node.params;
      try {
        includeConfig = Object.entries(node.params?.kv).reduce((acc, [key, value]) => {
          if (!Object.hasOwn(DefaultConfig, key)) this.info(`Unknown meta config key '${key}' for import defined`, node);
          acc[key as keyof Config] = ((value as Program).body[0] as RawStatement).value;
          return acc;
        }, includeConfig);
      } catch (_) {
        this.err("Invalid meta config for import. Meta config must not contain functions", node);
      }
    }

    // determine type
    if (include.startsWith("pkg:")) {
      // (standard) package
      const pkg = include.split(":", 2)[1];
    } else if (include.includes("://")) {
      // net
      if (this.config.net !== "true") {
        this.warn("Network access is disabled. Skipping import", node);
        return;
      }

      // call fetch synchronously using child process to avoid using await
      const syncScriptPath = path.join(__dirname, "utils", "sync-fetch.js");
      const child = spawnSync(process.execPath, [syncScriptPath, include]);

      if (child.error) {
        this.err(`Failed to import from '${include}' because ${child.error.message}`, node);
      }

      if (child.status !== 0) {
        this.err(`Failed to import from '${include}' because child process crashed with code ${child.status}: ${child.stderr}`, node);
      }

      fileContent = child.stdout.toString();
    } else {
      // local path relative to file in config(filePath)
      if (this.config.files !== "true") {
        this.warn("Reading files is disabled. Skipping import", node);
        return;
      }
      const srcFilePath = this.config.filePath;
      const targetFilePath = include;

      // file exists check
      const fullPath = path.resolve(srcFilePath, targetFilePath);
      if (!fs.existsSync(fullPath)) this.err(`Failed to import '${include}' because file not found: ${fullPath}`, node);

      fileContent = fs.readFileSync(fullPath, (this.config.fileEncoding as BufferEncoding) ?? null /* ? file encoding of this file?*/);
    }

    this.verifyImportHash(hashInclude, fileContent, include, node, this.config);
    this.importAST(include, fileContent, includeConfig as Config, node);
  }
  // Make sure custom override metaconfig is transitive!!

  /**
   * sha256 hash verification
   */
  verifyImportHash(hash: string, fileContent: string, include: string, node: ASTNode, config: Config): void {
    if (hash === "") return;

    const actualHash = crypto
      .createHash("sha256")
      .update(fileContent as string, (config.fileEncoding as BufferEncoding) ?? "utf8")
      .digest("hex");

    if (actualHash !== hash)
      this.err(
        `Refused to import '${include}' because content hash does not match the provided hash.
        Provided: ${hash}
        Actual: ${actualHash}
      `,
        node
      );
  }

  importAST(include: string, fileContent: string, includeConfig: Config, node: ASTNode): void {
    this.info(`Importing '${include}' ${includeConfig !== undefined ? "with custom config" : ""}`, node);
    const initConfig = { ...DefaultConfig, ...includeConfig };
    initConfig["fileName"] = include;
    const [code, cfg] = preprocess(fileContent, initConfig, true);
    const program = analyze(parse(tokenize(code, cfg), false, cfg), cfg);
    if (program === undefined) this.err(`Failed to include '${include}'`, node);
    this.root.body.unshift(...program.body);
  }

  visitEvalStatement(node: EvalStatement): void {
    this.setFileNameIfNotAlreadySet(node);
    // if (this.config.eval !== "true") warn("JavaScript evaluation is disabled. Skipping code", ...rowcol(node));
  }

  visitComment(node: Comment): void {
    this.setFileNameIfNotAlreadySet(node);
    // Implement comment analysis logic here
  }
}

/**
 * @deprecated
 */
function replaceEvalWithRaw(node: EvalStatement): RawStatement {
  return new RawStatement(node.expr, node.row, node.col);
}
