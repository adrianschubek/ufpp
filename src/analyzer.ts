import { ASTNode } from "./ast";
import { Config } from "./common";
import { Visitor } from "./visitor";

export function analyze(node: ASTNode, config: Config): ASTNode {
  // Analyzing Visitor (imports, allow/disallow features)
  // imports only for \use{\file...} or \use{\url...} or \use{stdlib} -> scan full ast -> add imports to config
  // other \url,\file IGNORE. they are on demand in-place reads as-is without eval. do not eval
  // scan for node types: use>raw, use>url, use>file

  return node;
}

export class Analyzer implements Visitor<void> {

}