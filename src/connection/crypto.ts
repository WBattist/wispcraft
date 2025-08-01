import { Buffer } from "../buffer";
import { CFBEncryptor, CFBDecryptor } from "aes-ts";

// WARNING: This is a custom, from-scratch MD5 implementation.
// This is a very bad practice due to security and performance concerns.
// It is kept here only because it's required for `offlineUUID` and no standard
// library was previously used. It should be replaced with a vetted library.
function md5(inputString) {
	function rh(n) {
		var bytes: any = [];
		for (var j = 0; j <= 3; j++) {
			bytes.push((n >> (j * 8)) & 0xff);
		}
		return bytes;
	}
	function ad(x, y) {
		var l = (x & 0xffff) + (y & 0xffff);
		var m = (x >> 16) + (y >> 16) + (l >> 16);
		return (m << 16) | (l & 0xffff);
	}
	function rl(n, c) {
		return (n << c) | (n >>> (32 - c));
	}
	function cm(q, a, b, x, s, t) {
		return ad(rl(ad(ad(a, q), ad(x, t)), s), b);
	}
	function ff(a, b, c, d, x, s, t) {
		return cm((b & c) | (~b & d), a, b, x, s, t);
	}
	function gg(a, b, c, d, x, s, t) {
		return cm((b & d) | (c & ~d), a, b, x, s, t);
	}
	function hh(a, b, c, d, x, s, t) {
		return cm(b ^ c ^ d, a, b, x, s, t);
	}
	function ii(a, b, c, d, x, s, t) {
		return cm(c ^ (b | ~d), a, b, x, s, t);
	}
	function sb(x) {
		var i;
		var nblk = ((x.length + 8) >> 6) + 1;
		var blks = new Array(nblk * 16);
		for (i = 0; i < nblk * 16; i++) blks[i] = 0;
		for (i = 0; i < x.length; i++)
			blks[i >> 2] |= x.charCodeAt(i) << ((i % 4) * 8);
		blks[i >> 2] |= 0x80 << ((i % 4) * 8);
		blks[nblk * 16 - 2] = x.length * 8;
		return blks;
	}
	var i,
		x = sb("" + inputString),
		a = 1732584193,
		b = -271733879,
		c = -1732584194,
		d = 271733878,
		olda,
		oldb,
		oldc,
		oldd;
	for (i = 0; i < x.length; i += 16) {
		olda = a;
		oldb = b;
		oldc = c;
		oldd = d;
		a = ff(a, b, c, d, x[i + 0], 7, -680876936);
		d = ff(d, a, b, c, x[i + 1], 12, -389564586);
		c = ff(c, d, a, b, x[i + 2], 17, 606105819);
		b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
		a = ff(a, b, c, d, x[i + 4], 7, -176418897);
		d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
		c = ff(c, d, a, b, x[i + 6], 17, -1473231341);
		b = ff(b, c, d, a, x[i + 7], 22, -45705983);
		a = ff(a, b, c, d, x[i + 8], 7, 1770035416);
		d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
		c = ff(c, d, a, b, x[i + 10], 17, -42063);
		b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
		a = ff(a, b, c, d, x[i + 12], 7, 1804603682);
		d = ff(d, a, b, c, x[i + 13], 12, -40341101);
		c = ff(c, d, a, b, x[i + 14], 17, -1502002290);
		b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
		a = gg(a, b, c, d, x[i + 1], 5, -165796510);
		d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
		c = gg(c, d, a, b, x[i + 11], 14, 643717713);
		b = gg(b, c, d, a, x[i + 0], 20, -373897302);
		a = gg(a, b, c, d, x[i + 5], 5, -701558691);
		d = gg(d, a, b, c, x[i + 10], 9, 38016083);
		c = gg(c, d, a, b, x[i + 15], 14, -660478335);
		b = gg(b, c, d, a, x[i + 4], 20, -405537848);
		a = gg(a, b, c, d, x[i + 9], 5, 568446438);
		d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
		c = gg(c, d, a, b, x[i + 3], 14, -187363961);
		b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
		a = gg(a, b, c, d, x[i + 13], 5, -1444681467);
		d = gg(d, a, b, c, x[i + 2], 9, -51403784);
		c = gg(c, d, a, b, x[i + 7], 14, 1735328473);
		b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
		a = hh(a, b, c, d, x[i + 5], 4, -378558);
		d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
		c = hh(c, d, a, b, x[i + 11], 16, 1839030562);
		b = hh(b, c, d, a, x[i + 14], 23, -35309556);
		a = hh(a, b, c, d, x[i + 1], 4, -1530992060);
		d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
		c = hh(c, d, a, b, x[i + 7], 16, -155497632);
		b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
		a = hh(a, b, c, d, x[i + 13], 4, 681279174);
		d = hh(d, a, b, c, x[i + 0], 11, -358537222);
		c = hh(c, d, a, b, x[i + 3], 16, -722521979);
		b = hh(b, c, d, a, x[i + 6], 23, 76029189);
		a = hh(a, b, c, d, x[i + 9], 4, -640364487);
		d = hh(d, a, b, c, x[i + 12], 11, -421815835);
		c = hh(c, d, a, b, x[i + 15], 16, 530742520);
		b = hh(b, c, d, a, x[i + 2], 23, -995338651);
		a = ii(a, b, c, d, x[i + 0], 6, -198630844);
		d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
		c = ii(c, d, a, b, x[i + 14], 15, -1416354905);
		b = ii(b, c, d, a, x[i + 5], 21, -57434055);
		a = ii(a, b, c, d, x[i + 12], 6, 1700485571);
		d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
		c = ii(c, d, a, b, x[i + 10], 15, -1051523);
		b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
		a = ii(a, b, c, d, x[i + 8], 6, 1873313359);
		d = ii(d, a, b, c, x[i + 15], 10, -30611744);
		c = ii(c, d, a, b, x[i + 6], 15, -1560198380);
		b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
		a = ii(a, b, c, d, x[i + 4], 6, -145523070);
		d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
		c = ii(c, d, a, b, x[i + 2], 15, 718787259);
		b = ii(b, c, d, a, x[i + 9], 21, -343485551);
		a = ad(a, olda);
		b = ad(b, oldb);
		c = ad(c, oldc);
		d = ad(d, oldd);
	}
	return [...rh(a), ...rh(b), ...rh(c), ...rh(d)];
}


export function offlineUUID(name: string): number[] {
	const hash = md5("OfflinePlayer:" + name);
	hash[6] = (hash[6] & 0x0f) | 0x30; // Version 3 UUID
	hash[8] = (hash[8] & 0x3f) | 0x80; // Variant
	return hash;
}

export function bytesToUuid(byteArray: number[]) {
	let hexString = "";
	for (let i = 0; i < 16; i++) {
		const hex = byteArray[i].toString(16).padStart(2, "0");
		hexString += hex;
	}
	return `${hexString.slice(0, 8)}-${hexString.slice(8, 12)}-${hexString.slice(12, 16)}-${hexString.slice(16, 20)}-${hexString.slice(20)}`;
}

export class Decryptor {
	private aesCfb: CFBDecryptor | null = null;
	transform: TransformStream<Buffer>;

	seed(iv: Uint8Array) {
		this.aesCfb = new CFBDecryptor(iv, iv, 1);
	}

	constructor() {
		this.transform = new TransformStream<Buffer>({
			transform: (chunk, controller) => {
				if (!this.aesCfb) {
					controller.enqueue(chunk);
					return;
				}
				controller.enqueue(new Buffer(this.aesCfb.decrypt(chunk.inner)));
			},
		});
	}
}

export class Encryptor {
	private aesCfb: CFBEncryptor | null = null;

	constructor() {}

	seed(iv: Uint8Array) {
		this.aesCfb = new CFBEncryptor(iv, iv, 1);
	}

	transform(chunk: Buffer): Buffer {
		if (!this.aesCfb) return chunk;
		return new Buffer(this.aesCfb.encrypt(chunk.inner));
	}
}

export function makeSharedSecret(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(16));
}

// Store imported keys to avoid re-importing, which can be slow.
const keyCache = new Map<string, CryptoKey>();

export async function loadKey(keyBytes: Uint8Array): Promise<CryptoKey> {
    const keyStr = keyBytes.toString();
    if (keyCache.has(keyStr)) {
        return keyCache.get(keyStr)!;
    }

	const key = await crypto.subtle.importKey(
		"spki",
		keyBytes.buffer,
		{
			name: "RSA-PKCS1-v1_5",
			hash: "SHA-1", 
		},
		true,
		["encrypt"]
	);
    keyCache.set(keyStr, key);
    return key;
}

export async function encryptRSA(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
	const encrypted = await crypto.subtle.encrypt(
		{
			name: "RSA-PKCS1-v1_5",
		},
		key,
		data
	);
	return new Uint8Array(encrypted);
}

export async function mchash(input: Uint8Array): Promise<string> {
	let buf = new Uint8Array(await crypto.subtle.digest("sha-1", input));
    
    // Minecraft's weird "special" signed hex digest, required for session authentication.
	let isNegative = (buf[0] & 0x80) === 0x80;

	if (isNegative) {
        // Perform two's complement
        let carry = 1;
        for (let i = buf.length - 1; i >= 0; i--) {
            buf[i] = (~buf[i] & 0xff) + carry;
            carry = (buf[i] === 0x100) ? 1 : 0;
            if (carry === 0) break;
        }
	}

    const hex = Array.from(buf, byte => byte.toString(16).padStart(2, '0')).join('');
    // Trim leading zeros, as Java's BigInteger.toString(16) would do.
	return (isNegative ? "-" : "") + hex.replace(/^0+/, '');
}