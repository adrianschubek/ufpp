---
sidebar_position: 1
---

# Installation

### Using [npm](https://www.npmjs.com/package/utpp) (recommended)

```
npm install -g utpp
```

or if you want to test it without installing it globally:

```
npx utpp
```

### Using Precompiled binaries

```
sudo curl -fSsL https://github.com/adrianschubek/utpp/releases/latest/download/utpp-linux -o /usr/local/bin/utpp && sudo chmod +x /usr/local/bin/utpp
```

Precompiled binaries for **Linux** (x64, alpine) and **Windows** (x64) are published every [release](https://github.com/adrianschubek/utpp/releases).

Both compressed (.tar.gz) and uncompressed binaries are available.

_Linux-alpine_ binaries are designed to be used in docker containers.

**MacOS** and _arm_ binaries are not published yet, but you can compile them yourself (see below).

### Compile binaries yourself

1. clone this repo
2. run `npm install`
3. run `npm run build:npm`
4. run `npm run pack`
5. binaries for various platforms are compiled in `/dist`

> Move the executable to `/usr/local/bin` for easier CLI access: `sudo mv <your-file> /usr/local/bin/utpp`