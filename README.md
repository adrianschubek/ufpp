<div align="center">

![](utpp.png)
![](p1.png)
![](p2.png)
![](p3.png)

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat-square&logo=typescript&logoColor=white)
[![npm](https://img.shields.io/npm/v/utpp?color=blue&style=flat-square)](https://www.npmjs.com/package/utpp)

</div>

<h2 align="center">

  Visit [utpp.adriansoftware.de](https://utpp.adriansoftware.de) for documentation & more! 

</h2>

## Features
- **Universal**: works with any file format
- **Branching**: use if/else logic to include/exclude/modify parts of your file
- **Variables**: use placeholders in your file and replace them with variables
- **Scripting**: execute custom JavaScript code anywhere
- **Portable**: works on any platform (Windows, Linux, MacOS, Docker containers etc.)

## Use Cases
- Dynamically modifiy static config files based on user input
- Replace placeholder with custom eval'd JavaScript on startup
- Start a supervisor service conditionally using docker run arguments. 
- Use different compile commands based on user's current architecture
- and many more...


<!-- 
nodemon --ext 'txt,ts'  out/index.js -p tests/loop.txt

wie latex multi-pass erst loops -> ...
add latex syntax
 - allow custom prefix instead of `\` allow e.g. `##`
TODO: add loops (polyfill using rewriting)
TODO: allow nesting
 -->