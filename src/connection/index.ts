import { EaglerProxy } from "../1.8";
import { connect_tcp, epoxyFetch } from "./epoxy";
import { Buffer } from "../buffer";
import {
	bufferTransformer,
	bufferWriter,
	BytesReader,
	BytesWriter,
	lengthTransformer,
	writeTransform,
} from "./framer";
import type { AuthStore } from "..";

function link<T>(): [ReadableStream<T>, WritableStream<T>] {
	let readController: ReadableStreamDefaultController<T>;
	let writeController: WritableStreamDefaultController;

	return [
		new ReadableStream({
			start(controller) {
				readController = controller;
			},
			cancel() {
				writeController.error("other side closed");
			},
		}),
		new WritableStream({
			start(controller) {
				writeController = controller;
			},
			write(obj) {
				readController.enqueue(obj);
			},
			close() {
				readController.close();
			},
		}),
	];
}

export class Connection {
	// used by fake websocket
	eaglerIn: BytesWriter;
	eaglerOut: BytesReader;

	// linked to eaglerIn, has packets the client sends
	processIn: BytesReader;
	// linked to eaglerOut, has packets the server sends
	processOut: BytesWriter;

	url: URL;

	impl?: EaglerProxy;
	rawEpoxy?: BytesWriter;

	constructor(
		uri: string,
		private authStore: AuthStore
	) {
		const [processIn, eaglerIn] = link<Buffer>();
		this.processIn = processIn.getReader();
		this.eaglerIn = eaglerIn.getWriter();

		const [eaglerOut, processOut] = link<Buffer>();
		this.eaglerOut = eaglerOut.getReader();
		this.processOut = processOut.getWriter();

		this.url = new URL(uri.slice(uri.toLowerCase().indexOf("://") + 3));
		if (!this.url.port) this.url.port = "25565";
		if (this.url.protocol != "java:") throw new Error("invalid protocol");
	}

	async forward(connectcallback: () => void) {
		let connectUrl: URL | undefined;
		try {
			const dns = await epoxyFetch(
				`https://cloudflare-dns.com/dns-query?name=_minecraft._tcp.${this.url.hostname}&type=SRV`,
				{
					headers: {
						Accept: "application/dns-json",
					},
				}
			);
			const dnsResponse = await dns.json();
			if (dnsResponse.Answer?.length) {
				const data = dnsResponse.Answer[0].data.split(" ");
				const port = data[2];
				const hostname = data[3];
				connectUrl = new URL(`java://${hostname}:${port}`);
			}
		} catch (e) {
            console.warn("SRV lookup failed, falling back to provided address:", e);
        }

		const conn = await connect_tcp(
			connectUrl ? connectUrl.host : this.url.host
		);
		connectcallback();

		const epoxyWriter = conn.write.getWriter();
		this.rawEpoxy = bufferWriter(epoxyWriter).getWriter();

		const impl = new EaglerProxy(
			this.processOut,
			writeTransform(this.rawEpoxy, async (p: Buffer) => {
				const pk = await impl.compressor.transform(p);
				let b = Buffer.new();
				b.writeVarInt(pk.length);
				b.extend(pk);
				return impl.encryptor.transform(b);
			}).getWriter(),
			this.url.hostname,
			this.url.port ? parseInt(this.url.port) : 25565,
			this.authStore
		);
        this.impl = impl;

		// Define a single cleanup function to tear down the entire connection
		const cleanup = () => {
			console.log("Cleaning up connection...");
			// Closing/cancelling one stream will propagate through the chain,
			// but we do it explicitly to be safe.
			epoxyWriter.close().catch(e => console.error("Error closing epoxy writer:", e));
			this.processIn.cancel().catch(e => console.error("Error cancelling processIn:", e));
		};

		// Task for handling data from Server -> Client
		const serverToClient = async () => {
			try {
				const reader = conn.read
					.pipeThrough(bufferTransformer())
					.pipeThrough(impl.decryptor.transform)
					.pipeThrough(lengthTransformer())
					.pipeThrough(impl.decompressor.transform)
					.getReader();

				while (true) {
					const { done, value } = await reader.read();
					if (done || !value) break;
					await impl.epoxyRead(value);
				}
			} finally {
				cleanup();
			}
		};

		const clientToServer = async () => {
			try {
				const reader = this.processIn;
				while (true) {
					const { done, value } = await reader.read();
					if (done || !value) break;
					await impl.eaglerRead(value);
				}
			} finally {
				cleanup();
			}
		};

		serverToClient().catch(e => {
			console.error("Server->Client pipe failed:", e);
			cleanup();
		});
		clientToServer().catch(e => {
			console.error("Client->Server pipe failed:", e);
			cleanup();
		});
	}

	ping() {
		this.impl?.ping();
	}
}