/**
 * @typedef {object} MP3Header
 * @property {Uint8Array} buffer
 * @property {number} version
 * @property {number} layer
 * @property {boolean} crc whether CRC is used in frame
 * @property {number} bitrate frame bitrate
 * @property {number} freq sampling frequency rate
 * @property {boolean} padded whether frame is padded
 * @property {('Stereo'|'Joint Stereo'|'Dual'|'Mono')} channel type of channel
 * @property {number} samples count of samples in frame
 * @property {number} duration milliseconds in frame
 * @property {number} size byte size of frame
 *
 * @typedef {object} MP3Frame
 * @property {MP3Header} header header of the MP3 frame
 * @property {Uint8Array} data byte array, including header
 */

function parseSyncSafeInteger(buffer) {
	return (buffer[0] << 21) | (buffer[1] << 14) | (buffer[2] << 7) | buffer[3];
}

function findNextFrame(buffer, offset = 0) {
	for (let i = offset; i < buffer.length; i++) {
		if (buffer[i] === 0xff && (buffer[i + 1] & 0xf0) === 0xf0) return i;
	}
	return -1;
}

/**
 * Parse an MP3 header from a byte buffer.
 * @param {Uint8Array} buffer
 * @returns {MP3Header?} header or null if buffer could not be parsed into an MP3 frame.
 */
function parseFrame(buffer) {
	if (buffer[0] !== 0xff) return null;
	if (buffer[1] & (0xf0 !== 0xf0)) return null;

	// Make a copy of the header buffer to avoid downstream users from modifying source.
	const header = { buffer: buffer.slice() };

	header.version = {
		0b00011000: 1,
		0b00010000: 2,
	}[buffer[1] & 0b00011000];
	if (!header.version) return null;

	header.layer = {
		0b00000010: 3,
		0b00000100: 2,
		0b00000110: 1,
	}[buffer[1] & 0b00000110];
	if (!header.layer) return null;

	header.crc = { 0x0: false, 0x1: true }[buffer[1] & 0x1];

	header.bitrate = (({
		// 0b00000000: free,
		0b00010000: {
			1: { 1: 32, 2: 32, 3: 32 }, // Version 1.
			2: { 1: 32, 2: 8, 3: 8 }, // Version 2.
		},
		0b00100000: {
			1: { 1: 64, 2: 48, 3: 40 }, // Version 1.
			2: { 1: 48, 2: 16, 3: 16 }, // Version 2.
		},
		0b00110000: {
			1: { 1: 96, 2: 56, 3: 48 }, // Version 1.
			2: { 1: 56, 2: 24, 3: 24 }, // Version 2.
		},
		0b01000000: {
			1: { 1: 128, 2: 64, 3: 56 }, // Version 1.
			2: { 1: 64, 2: 32, 3: 32 }, // Version 2.
		},
		0b01010000: {
			1: { 1: 160, 2: 80, 3: 64 }, // Version 1.
			2: { 1: 80, 2: 40, 3: 40 }, // Version 2.
		},
		0b01100000: {
			1: { 1: 192, 2: 96, 3: 80 }, // Version 1.
			2: { 1: 96, 2: 48, 3: 48 }, // Version 2.
		},
		0b01110000: {
			1: { 1: 224, 2: 112, 3: 96 }, // Version 1.
			2: { 1: 112, 2: 56, 3: 56 }, // Version 2.
		},
		0b10000000: {
			1: { 1: 256, 2: 128, 3: 112 }, // Version 1.
			2: { 1: 128, 2: 64, 3: 64 }, // Version 2.
		},
		0b10010000: {
			1: { 1: 288, 2: 160, 3: 128 }, // Version 1.
			2: { 1: 144, 2: 80, 3: 80 }, // Version 2.
		},
		0b10100000: {
			1: { 1: 320, 2: 192, 3: 160 }, // Version 1.
			2: { 1: 160, 2: 96, 3: 96 }, // Version 2.
		},
		0b10110000: {
			1: { 1: 352, 2: 224, 3: 192 }, // Version 1.
			2: { 1: 176, 2: 112, 3: 112 }, // Version 2.
		},
		0b11000000: {
			1: { 1: 384, 2: 256, 3: 224 }, // Version 1.
			2: { 1: 192, 2: 128, 3: 128 }, // Version 2.
		},
		0b11010000: {
			1: { 1: 416, 2: 320, 3: 256 }, // Version 1.
			2: { 1: 224, 2: 144, 3: 144 }, // Version 2.
		},
		0b11100000: {
			1: { 1: 448, 2: 384, 3: 320 }, // Version 1.
			2: { 1: 256, 2: 160, 3: 160 }, // Version 2.
		},
		// 0b11110000: bad,
	}[buffer[2] & 0xf0] || {})[header.version] || {})[header.layer];
	if (!header.bitrate) return null;

	header.freq = ({
		0b00000000: { 1: 44100, 2: 22050 },
		0b00000100: { 1: 48000, 2: 24000 },
		0b00001000: { 1: 32000, 2: 16000 },
		// 0b00001100: reserved,
	}[buffer[2] & 0b00001100] || {})[header.version];
	if (!header.freq) return null;

	header.padded = {
		0b00000000: false,
		0b00000010: true,
	}[buffer[2] & 0b00000010];

	header.channel = {
		0b00000000: "Stereo",
		0b01000000: "Joint Stereo",
		0b10000000: "Dual",
		0b11000000: "Mono",
	}[buffer[3] & 0b11000000];

	header.samples = {
		1: { 1: 384, 2: 1152, 3: 1152 },
		2: { 1: 384, 2: 1152, 3: 576 },
	}[header.version][header.layer];

	header.duration = (1_000 * header.samples) / header.freq;

	const numerator = header.samples * header.bitrate * 125;
	header.size = {
		1: (numerator / header.freq + (header.padded ? 1 : 0) * 4) | 0,
		2: (numerator / header.freq + (header.padded ? 1 : 0)) | 0,
		3: (numerator / header.freq + (header.padded ? 1 : 0)) | 0,
	}[header.layer];

	return header;
}

/**
 * Skip MP3 ID3 tag.
 * @param {Uint8Array} buffer
 * @returns {Uint8Array} MP3 buffer without ID3 tag.
 */
export function skipID3(buffer) {
	const tag = new TextDecoder("ascii").decode(buffer.subarray(0, 3));

	if (tag === "ID3") {
		const offset = parseSyncSafeInteger(buffer.subarray(6, 10)) + 10;
		return buffer.subarray(offset);
	} else if (tag === "TAG") {
		throw new Error("Only ID3 tags are supported.");
	}

	return buffer;
}

/**
 * Iterates over MP3 frames found in the input buffer.
 * @param {Uint8Array} buffer
 * @returns {Generator<MP3Frame>} Iterator of MP3 frames.
 */
export function* frameIterator(buffer) {
	let prevIdx = 0;
	let currIdx = 0;
	let header = null;

	do {
		currIdx = findNextFrame(buffer, currIdx + (header?.size || 1));
		if (currIdx < 0) break; // EOF
		header = parseFrame(buffer.subarray(currIdx, currIdx + 4));
		if (!header) continue; // False positive
		yield { header: header, data: buffer.subarray(prevIdx, currIdx) };
		prevIdx = currIdx;
	} while (prevIdx >= 0);

	if (header) yield { header: header, data: buffer.subarray(prevIdx) };
}
