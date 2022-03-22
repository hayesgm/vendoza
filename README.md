# Vendoza

![Vendoza](./vendoza.png)

Vendoza is a simple NodeJS app to audit files against a `manifest.json` file. If you are importing remote files into your local code base, but you want to keep track of a chain of custody to ensure nothing was changed, Vendoza can help.

## Install

```sh
yarn install vendoza # or npm
```

You can also install globally:

```sh
yarn global add vendoza
```

## Usage

Add a `manifest.json` file to folder you want to audit. E.g.

**manifest.json**

```json
{
  "files": {
    "src/some_file.ts": {
      "source": {
        "git": {
          "repo": "git@github.com:organization/repo.git",
          "commit": "788d338c9b53d57f7229f79815573dcb91ecede2",
          "path": ["src"]
        }
      }
    }
  }
}
```

Then run:

```
npx vendoza ./manfiest.json
```

## Expected Diffs

If you make a patch to a file, you can include the expected diffs in your manifest that will be checked during audit, e.g.:

```js
{
  "files": {
    "src/some_file.ts": {
      "source": {
        "git": {
          "repo": "git@github.com:organization/repo.git",
          "commit": "788d338c9b53d57f7229f79815573dcb91ecede2",
          "path": ["src"]
        }
      },
      "patches": [
        {
          "oldStart": 1,
          "oldLines": 14,
          "newStart": 1,
          "newLines": 14,
          "lines": [
            // ...
          ]
        }
      ]
    }
  }
}
```

As these patches might be too burdensome to write by hand, you can have Vendoza print the found diffs with `--patches`, e.g.

```sh
> npx vendoza ./manifest.json --patches

Patches written to `patches.json`
```

You can then copy and paste those patches into your `manifest.json` file.

### Contributing

Make a pull request or fork the repo.

### License

Copyright 2022 Geoffrey Hayes, Compound Labs, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
