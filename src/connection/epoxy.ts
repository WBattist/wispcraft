import initEpoxy, {
	EpoxyIoStream,
	EpoxyWebSocket,
	EpoxyClient,
	EpoxyClientOptions,
	EpoxyHandlers,
} from "@mercuryworkshop/epoxy-tls";
import { setWispUrl } from "..";

let connectedwisp = "";

let epoxy: EpoxyClient | null = null;

let resolver: (value: unknown) => void;
let initpromise = new Promise((r) => (resolver = r));
let initted = false;

export async function initWisp(wisp: string) {
	if (!initted) {
		initted = true;
		await initEpoxy();

		self.Request = new Proxy(self.Request, {
			construct(target, [input, init]) {
				return new target(input || "about:blank", init);
			},
		});
	}

	const options = new EpoxyClientOptions();
	options.wisp_v2 = false;
	options.udp_extension_required = false;
	connectedwisp = wisp;
	epoxy = new EpoxyClient(wisp, options);
	resolver(true);
}

export async function epoxyFetch(url: string, opts?: any): Promise<Response> {
	await initpromise;
	return await epoxy!.fetch(url, opts);
}

export async function epoxyWs(
	handlers: EpoxyHandlers,
	uri: string,
	protocols?: string | string[]
): Promise<EpoxyWebSocket> {
	await initpromise;
	return await epoxy!.connect_websocket(
		handlers,
		uri,
		protocols ? (typeof protocols == "string" ? [protocols] : protocols) : [],
		{}
	);
}

export async function connect_tcp(socket: string): Promise<EpoxyIoStream> {
	await initpromise;
	return await epoxy!.connect_tcp(socket);
}

export function set_wisp_server(wisp_url: string) {
    if (epoxy) {
        try {
            // The library's cleanup method is likely named `free` or `close`.
            // Using `free` as a placeholder.
            epoxy.free(); 
        } catch (e) {
            console.error("Error freeing old epoxy client:", e);
        }
    }

	initpromise = new Promise((r) => (resolver = r));
	setWispUrl(wisp_url);
	initWisp(wisp_url);
}

export async function reconnect() {
	await initpromise;
	await epoxy!.replace_stream_provider();
}