import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { once } from 'node:events';
import { z } from 'zod';
const maximumPacket = 16 * 1024 * 1024;
/** A disposable-database wire fault, never a general database/network proxy. */
export class OwnedPostgresProxy {
    readonly #database: string;
    readonly #original: URL;
    readonly #server: Server;
    readonly #sockets = new Set<Socket>();
    readonly #backendKeys = new Set<string>();
    readonly progress = { startups: 0, canonicalParses: 0, canonicalBinds: 0, matchedProjectBinds: 0, commits: 0, cancellations: 0 };
    #port: number | undefined;
    #armedProject: Buffer | undefined;
    #selected: Socket | undefined;
    #expectedDropCancellation: string | undefined;
    droppedCommits = 0;
    guardFailure: string | undefined;
    constructor() {
        const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
        let original: URL;
        try {
            original = new URL(process.env['DATABASE_URL'] ?? 'invalid:');
        }
        catch {
            throw new Error('An explicit disposable PostgreSQL database is required.');
        }
        if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || !['postgres:', 'postgresql:'].includes(original.protocol) || original.hostname !== '127.0.0.1' || original.port !== '54329' || original.pathname !== '/' + database || original.username !== 'gategoldjira' || original.searchParams.get('sslmode') !== 'disable')
            throw new Error('Commit-ack fixtures may proxy only the owning disposable PostgreSQL database.');
        this.#database = database;
        this.#original = original;
        this.#server = createServer(client => this.#connection(client));
    }
    async start() {
        this.#server.listen(0, '127.0.0.1');
        await once(this.#server, 'listening');
        const address = this.#server.address();
        if (!address || typeof address === 'string')
            throw new Error('No owned PostgreSQL proxy listener.');
        this.#port = address.port;
    }
    databaseUrlFor(database: string) {
        if (database !== this.#database || !this.#server.listening || !this.#port)
            throw new Error('Only the active owned proxy can supply its database capability.');
        const url = new URL(this.#original);
        url.port = String(this.#port);
        return url.href;
    }
    arm(projectId: string) {
        z.uuid().parse(projectId);
        if (!this.#server.listening || this.#armedProject || this.#selected || this.droppedCommits)
            throw new Error('A commit fault must be armed exactly once on an active owned proxy.');
        this.#armedProject = Buffer.from(projectId.replaceAll('-', ''), 'hex');
    }
    async stop() {
        for (const socket of this.#sockets)
            socket.destroy();
        this.#sockets.clear();
        if (this.#server.listening)
            await new Promise<void>((resolve, reject) => this.#server.close(error => error ? reject(error) : resolve()));
        this.#port = undefined;
        this.#expectedDropCancellation = undefined;
        this.#backendKeys.clear();
    }
    #connection(client: Socket) {
        const upstream = createConnection({ host: '127.0.0.1', port: 54329 });
        // Preserve the driver's low-latency small-frame behavior. A proxy's
        // default Nagle buffering otherwise adds a delay to each SQL round trip.
        client.setNoDelay(true);
        upstream.setNoDelay(true);
        this.#sockets.add(client);
        this.#sockets.add(upstream);
        let frontend = Buffer.alloc(0), backend = Buffer.alloc(0), started = false, intentionalDrop = false;
        let backendKey: string | undefined;
        let phase = 'startup';
        const statements = new Set<string>();
        const stop = () => {
            client.destroy();
            upstream.destroy();
            this.#sockets.delete(client);
            this.#sockets.delete(upstream);
            if (backendKey)
                this.#backendKeys.delete(backendKey);
        };
        const reject = () => {
            this.guardFailure = 'The owned PostgreSQL protocol guard rejected an unexpected ' + phase + ' packet.';
            stop();
        };
        for (const socket of [client, upstream]) {
            socket.on('error', () => {
                if (!intentionalDrop)
                    this.guardFailure = 'An owned PostgreSQL proxy socket failed.';
                stop();
            });
            socket.on('close', stop);
            socket.setTimeout(60000, stop);
        }
        client.on('drain', () => upstream.resume());
        upstream.on('drain', () => client.resume());
        client.on('data', (chunk: Buffer) => {
            try {
                frontend = Buffer.concat([frontend, chunk]);
                if (frontend.length > maximumPacket)
                    throw new Error();
                if (!started) {
                    if (frontend.length < 4)
                        return;
                    const length = frontend.readInt32BE(0);
                    if (length < 8 || length > 65536)
                        throw new Error();
                    if (frontend.length < length)
                        return;
                    const packet = frontend.subarray(0, length);
                    if (packet.readInt32BE(4) === 80877102) {
                        // Pinned pgx asyncClose also cancels after a lost socket.
                        // Accept only an active owned backend or the one-use private
                        // capability retained for this deliberately dropped backend.
                        if (length !== 16) throw new Error();
                        const key = packet.subarray(8).toString('hex');
                        if (!this.#backendKeys.has(key) && key !== this.#expectedDropCancellation) throw new Error();
                        if (key === this.#expectedDropCancellation) this.#expectedDropCancellation = undefined;
                        this.progress.cancellations++;
                        upstream.write(packet);
                        frontend = frontend.subarray(length);
                        started = true;
                        if (frontend.length)
                            throw new Error();
                        return;
                    }
                    if (packet.readInt32BE(4) !== 196608)
                        throw new Error();
                    const fields = packet.subarray(8).toString('utf8').split('\0'), values = new Map<string, string>();
                    for (let n = 0; n + 1 < fields.length; n += 2)
                        if (fields[n])
                            values.set(fields[n]!, fields[n + 1]!);
                    if (values.get('database') !== this.#database || values.get('user') !== 'gategoldjira')
                        throw new Error();
                    if (!upstream.write(packet))
                        client.pause();
                    frontend = frontend.subarray(length);
                    started = true;
                    this.progress.startups++;
                }
                while (frontend.length >= 5) {
                    const length = frontend.readInt32BE(1);
                    if (length < 4 || length > maximumPacket)
                        throw new Error();
                    if (frontend.length < length + 1)
                        return;
                    const packet = frontend.subarray(0, length + 1), body = packet.subarray(5), tag = String.fromCharCode(packet[0]!);
                    if (tag === 'P') {
                        phase = 'parse';
                        const end = body.indexOf(0);
                        if (end < 0)
                            throw new Error();
                        const statement = body.subarray(0, end).toString('utf8'), sqlEnd = body.indexOf(0, end + 1);
                        if (sqlEnd < 0)
                            throw new Error();
                        const sql = body.subarray(end + 1, sqlEnd).toString('utf8');
                        if (/INSERT\s+INTO\s+(?:public\.)?(?:issues|issue_records)\s*\(\s*id\s*,\s*project_id\s*,/i.test(sql)) {
                            statements.add(statement);
                            this.progress.canonicalParses++;
                        }
                        else
                            statements.delete(statement);
                    }
                    if (tag === 'B' && this.#armedProject && !this.#selected) {
                        phase = 'bind';
                        const armedProject = this.#armedProject;
                        const portalEnd = body.indexOf(0);
                        if (portalEnd < 0)
                            throw new Error();
                        const statementEnd = body.indexOf(0, portalEnd + 1);
                        if (statementEnd < 0)
                            throw new Error();
                        const statement = body.subarray(portalEnd + 1, statementEnd).toString('utf8');
                        if (statements.has(statement)) {
                            this.progress.canonicalBinds++;
                            let offset = statementEnd + 1;
                            const formatsCount = body.readInt16BE(offset);
                            offset += 2;
                            if (formatsCount < 0 || formatsCount > 256)
                                throw new Error();
                            const formats: number[] = [];
                            for (let n = 0; n < formatsCount; n++) {
                                formats.push(body.readInt16BE(offset));
                                offset += 2;
                            }
                            const parameterCount = body.readInt16BE(offset);
                            offset += 2;
                            if (parameterCount < 2 || parameterCount > 256)
                                throw new Error();
                            for (let n = 0; n < parameterCount; n++) {
                                const size = body.readInt32BE(offset);
                                offset += 4;
                                if (size < -1 || offset + Math.max(0, size) > body.length)
                                    throw new Error();
                                if (n === 1 && size >= 0) {
                                    const value = body.subarray(offset, offset + size), format = formatsCount === 1 ? formats[0] : formats[n] ?? 0;
                                    const match = format === 1 ? value.equals(armedProject) : value.toString('utf8').replaceAll('-', '').toLowerCase() === armedProject.toString('hex');
                                    if (match) {
                                        this.progress.matchedProjectBinds++;
                                        this.#selected = client;
                                        this.#armedProject = undefined;
                                    }
                                }
                                offset += Math.max(0, size);
                            }
                        }
                    }
                    if (!upstream.write(packet))
                        client.pause();
                    frontend = frontend.subarray(length + 1);
                }
            }
            catch {
                reject();
            }
        });
        upstream.on('data', (chunk: Buffer) => {
            try {
                backend = Buffer.concat([backend, chunk]);
                if (backend.length > maximumPacket)
                    throw new Error();
                while (backend.length >= 5) {
                    const length = backend.readInt32BE(1);
                    if (length < 4 || length > maximumPacket)
                        throw new Error();
                    if (backend.length < length + 1)
                        return;
                    const packet = backend.subarray(0, length + 1);
                    phase = 'backend';
                    if (packet[0] === 75) {
                        if (packet.length !== 13)
                            throw new Error();
                        backendKey = packet.subarray(5).toString('hex');
                        this.#backendKeys.add(backendKey);
                    }
                    if (packet[0] === 67 && packet.subarray(5).equals(Buffer.from('COMMIT\0')))
                        this.progress.commits++;
                    // CommandComplete COMMIT is emitted only after real PostgreSQL committed.
                    // Suppress that actual acknowledgement and close only these owned sockets.
                    if (this.#selected === client && packet[0] === 67 && packet.subarray(5).equals(Buffer.from('COMMIT\0'))) {
                        if (!backendKey) throw new Error();
                        this.#expectedDropCancellation = backendKey;
                        this.droppedCommits++;
                        intentionalDrop = true;
                        this.#selected = undefined;
                        stop();
                        return;
                    }
                    if (!client.write(packet))
                        upstream.pause();
                    backend = backend.subarray(length + 1);
                }
            }
            catch {
                reject();
            }
        });
    }
}
