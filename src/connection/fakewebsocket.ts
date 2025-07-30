import {
	EpoxyHandlers,
	EpoxyWebSocket,
	EpoxyWebSocketInput,
} from "@mercuryworkshop/epoxy-tls";
import { Connection } from ".";
import { authstore, COMMITHASH, VERSION, wispUrl } from "..";
import { Buffer } from "../buffer";
import { showUI } from "../ui";
import { epoxyWs } from "./epoxy";
// @ts-ignore typescript sucks
import wispcraft from "./wispcraft.png";

class WispWS extends EventTarget {
	inner: Connection;
	url: string;
	readyState: number;

	constructor(uri: string) {
		super();

		this.url = uri;
		this.inner = new Connection(uri, authstore);
		this.readyState = WebSocket.CONNECTING;
	}

	start() {
		this.inner.forward(() => {
			this.readyState = WebSocket.OPEN;
			this.dispatchEvent(new Event("open"));
		});
		(async () => {
			try {
				while (true) {
					const { done, value } = await this.inner.eaglerOut.read();
					if (done || !value) break;

					this.dispatchEvent(
						new MessageEvent("message", {
							data: typeof value === "string" ? value : value.inner,
						})
					);
				}
			} catch (err) {
				console.error("WispWS read loop error:", err);
				this.dispatchEvent(new Event("error"));
			} finally {
                this.readyState = WebSocket.CLOSING;
				this.dispatchEvent(new Event("close"));
				this.readyState = WebSocket.CLOSED;
            }
		})();
	}

	send(chunk: Uint8Array | ArrayBuffer | string) {
		let buf: Buffer;
		if (typeof chunk == "string") {
			if (chunk.toLowerCase() == "accept: motd") {
				this.inner.ping();
			}
			return;
		} else if (chunk instanceof ArrayBuffer) {
			buf = new Buffer(new Uint8Array(chunk), true);
		} else {
			buf = new Buffer(chunk, true);
		}

		if (
			this.url.includes("hypixel.net") &&
			!localStorage["disclaimer_accepted"]
		) {
			if (
				!window.confirm(
					"WARNING: Wispcraft in default configuration will route your traffic through a VPN. This is not officially supported by hypixel, and in the possible event your account gets locked we do not accept responsibility. Continue?"
				)
			) {
				this.dispatchEvent(new Event("error"));
				this.dispatchEvent(new CloseEvent("close"));
				return;
			}
			localStorage["disclaimer_accepted"] = "true";
		}

		this.inner.eaglerIn.write(buf);
	}

	close() {
		if (
			this.readyState == WebSocket.CLOSING ||
			this.readyState == WebSocket.CLOSED
		) {
			return;
		}
		this.readyState = WebSocket.CLOSING;
		// FIXED: Aborting both streams ensures the full teardown logic in Connection is triggered.
		try {
			this.inner.eaglerIn.abort();
            this.inner.eaglerOut.cancel();
		} catch (err) {}
		this.readyState = WebSocket.CLOSED;
	}
}
class SettingsWS extends EventTarget {
	readyState: number;
	constructor() {
		super();
		this.readyState = WebSocket.OPEN;
	}
	send(chunk: Uint8Array | ArrayBuffer | string) {
		if (typeof chunk === "string" && chunk.toLowerCase() === "accept: motd") {
			const accs = localStorage["wispcraft_accounts"]
				? JSON.parse(localStorage["wispcraft_accounts"]).length
				: 0;
			this.dispatchEvent(
				new MessageEvent("message", {
					data: JSON.stringify({
						name: "Settings",
						brand: "mercuryworkshop",
						vers: "wispcraft/" + VERSION,
						cracked: true,
						time: Date.now(),
						uuid: "00000000-0000-0000-0000-000000000000",
						type: "motd",
						data: {
							cache: false,
							icon: true,
							online: accs,
							max: 0,
							motd: ["Sign in with Microsoft", "Configure Proxy URL"],
							players: [`Version: ${VERSION}`, `Build: ${COMMITHASH}`],
						},
					}),
				})
			);
			fetch(wispcraft)
				.then((response) => response.blob())
				.then((image) => createImageBitmap(image))
				.then((image) => {
					let canvas = new OffscreenCanvas(image.width, image.height);
					let ctx = canvas.getContext("2d")!;
					ctx.drawImage(image, 0, 0);
					let pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
					this.dispatchEvent(
						new MessageEvent("message", { data: new Uint8Array(pixels) })
					);
				});
		} else {
			showUI();
			let str = "Settings UI launched.";
			let enc = new TextEncoder().encode(str);
			let eag = Uint8Array.from([0xff, 0x08, enc.length, ...enc]);
			this.dispatchEvent(new MessageEvent("message", { data: eag }));
			this.dispatchEvent(new CloseEvent("close"));
		}
	}
	close() {}
}

class EpoxyWS extends EventTarget {
	inner: EpoxyWebSocket | null;
	readyState: number;
	binaryType: string = "arraybuffer";
	queue: Array<EpoxyWebSocketInput>;

	constructor(uri: string, protocols?: string | string[]) {
		super();
		this.queue = [];
		this.inner = null;
		this.readyState = WebSocket.CONNECTING;
		this.start(uri, protocols);
	}

	async start(uri: string, protocols?: string | string[]) {
		const handlers = new EpoxyHandlers(
			() => {
				this.readyState = WebSocket.OPEN;
				this.dispatchEvent(new Event("open"));
				if (this.inner != null) {
					for (let item of this.queue) {
						this.inner.send(item);
					}
					this.queue.length = 0;
				}
			},
			() => {
				this.readyState = WebSocket.CLOSING;
				this.dispatchEvent(new CloseEvent("close"));
				this.readyState = WebSocket.CLOSED;
				if (this.inner != null) {
					this.inner.free();
				}
			},
			(error: Error) => {
				console.error(error);
				this.dispatchEvent(new Event("error"));
			},
			(data: Uint8Array) => {
				this.dispatchEvent(new MessageEvent("message", { data: data.buffer }));
			}
		);
		this.inner = await epoxyWs(handlers, uri, protocols);
	}

	send(chunk: Uint8Array | ArrayBuffer | string) {
		chunk = chunk.slice(0);
		if (chunk instanceof Uint8Array) {
			chunk = chunk.buffer as ArrayBuffer;
		}
		if (this.inner == null || this.readyState == WebSocket.CONNECTING) {
			this.queue.push(chunk);
		} else {
			this.inner.send(chunk);
		}
	}

	close() {
		if (
			this.inner != null &&
			this.readyState != WebSocket.CLOSED &&
			this.readyState != WebSocket.CLOSING
		) {
			try {
				this.inner.close(0, "");
			} catch (e) {}
		}
	}
}

class AutoWS extends EventTarget {
	inner: WebSocket | WispWS | EpoxyWS | null = null;
    queue: Array<Uint8Array | ArrayBuffer | string> = [];

	constructor(uri: string, protocols?: string | string[]) {
		super();
        this.tryConnectionMethods(uri, protocols);
	}
    
    async tryConnectionMethods(uri: string, protocols?: string | string[]) {
        const url = new URL(uri);
        const connectionMethods = [
            // Method 1: Try native WebSocket (secure only)
            () => {
                if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
                const secureUrl = new URL(url.toString());
                secureUrl.protocol = "wss:";
                return new NativeWebSocket(secureUrl.toString(), protocols);
            },
            // Method 2: Try Epoxy (TLS-in-JS WebSocket)
            () => new EpoxyWS(uri, protocols),
            // Method 3: Fallback to Wisp (Java protocol proxy)
            () => {
                const wispUri = `java://${url.hostname}:${url.port || "25565"}`;
                const ws = new WispWS(wispUri);
                ws.start();
                return ws;
            }
        ];

        for (const method of connectionMethods) {
            try {
                const ws = method();
                if (!ws) continue; // Skip if method is not applicable

                // Wait for this connection attempt to either open or fail
                const result = await new Promise<Event>((resolve) => {
                    ws.addEventListener('open', resolve, { once: true });
                    ws.addEventListener('error', resolve, { once: true });
                    ws.addEventListener('close', resolve, { once: true });
                });

                if (result.type === 'open') {
                    // Success! This is our connection now.
                    this.inner = ws;
                    // Re-route events
                    ws.removeEventListener('open', result.target.listeners.get('open')[0]);
                    ws.removeEventListener('error', result.target.listeners.get('error')[0]);
                    ws.removeEventListener('close', result.target.listeners.get('close')[0]);
                    
                    ws.addEventListener('message', (e) => this.dispatchEvent(new MessageEvent('message', e)));
                    ws.addEventListener('close', (e) => this.dispatchEvent(new CloseEvent('close', e)));
                    ws.addEventListener('error', (e) => this.dispatchEvent(new Event('error', e)));
                    
                    this.dispatchEvent(new Event('open'));

                    // Send any queued messages
                    for (const item of this.queue) {
                        this.inner.send(item);
                    }
                    this.queue = [];
                    return; // Stop trying other methods
                }
            } catch (e) {
                console.warn("Connection method failed to construct:", e);
            }
        }
        
        console.error("All connection methods failed.");
        this.dispatchEvent(new Event("error"));
        this.dispatchEvent(new CloseEvent("close"));
    }

	send(chunk: Uint8Array | ArrayBuffer | string) {
		if (this.inner == null || this.readyState == WebSocket.CONNECTING) {
			this.queue.push(chunk);
		} else {
			return this.inner.send(chunk);
		}
	}

	close() {
		if (this.inner != null) {
			try {
				return this.inner.close();
			} catch (e) {}
		}
	}

	get binaryType() {
		if (this.inner != null && this.inner instanceof WebSocket) {
			return this.inner.binaryType;
		}
		return "arraybuffer";
	}

	get readyState() {
		if (this.inner != null) {
			return this.inner.readyState;
		}
		return WebSocket.CONNECTING;
	}

	set binaryType(binaryType: BinaryType) {
		if (this.inner != null && this.inner instanceof WebSocket) {
			this.inner.binaryType = binaryType;
		}
	}
}

const NativeWebSocket = WebSocket;
export function makeFakeWebSocket(): typeof WebSocket {
	return new Proxy(WebSocket, {
		construct(_target, [uri, protos]) {
			// Do not proxy the proxy's own connection
			if (uri == wispUrl) {
				return new NativeWebSocket(uri, protos);
			}

			let url = new URL(uri);
            // Eagler uses custom protocols in the hostname part of the URL
			let isCustomProtocol = url.port == "" && url.pathname.startsWith("//");

			if (isCustomProtocol && url.hostname == "java") {
				const ws = new WispWS(uri);
				ws.start();
				return ws;
			} else if (isCustomProtocol && url.hostname == "settings") {
				return new SettingsWS();
			} else {
                // For regular ws:// or wss://, use the auto-fallback logic
				return new AutoWS(uri, protos);
			}
		},
	});
}