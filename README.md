# MP3Utils

Simple and dependency-free utils for reading individual MP3 frames from a buffer.

## Usage

```js
import * as mp3utils from "mp3utils";

// Read input file.
const input = "/path/to/file.mp3";
const buffer = await fs.readFile(input);

// Extract audio data.
const audio = skipID3(buffer);

// Extract audio frames.
const iter = frameIterator(buffer);
const frames = Array.from(iter);
```
