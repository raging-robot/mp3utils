import { frameIterator } from "./index.js";
import assert from "assert";
import * as fs from "fs/promises";

describe("mp3utils", () => {
	it("read mp3 from file", async () => {
		const input = "fixtures/sample.mp3";
		const buf = await fs.readFile(input);
		const iter = Array.from(frameIterator(buf));
		assert.equal(iter.length, 500);
	});

	it("read mp3 from response", async () => {
		const input = "fixtures/sample.mp3";
		const buf = await fs.readFile(input);
		const res = new Response(buf);
		const body = await res.arrayBuffer().then((arr) => new Uint8Array(arr));
		const iter = Array.from(frameIterator(body));
		assert.equal(iter.length, 500);
	});
});
