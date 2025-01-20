import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { CronJob } from "cron";
import { createInterface } from "readline/promises";
import { readFile, writeFile } from "fs/promises";

const readline = createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    const config = await serverConfigParser();
    const server = new Server(config);

    while (true) {
        const input = await readline.question("");
        switch (input) {
            case "restart":
                server.restart();
                break;
            case "stop":
                server.stop();
                break;
            case "start":
                server.start();
                break;
            default:
                server.command(input);
                break;
        }
    }
}

export default class Server {
    private childServerProcess: ChildProcessWithoutNullStreams;
    public isRunning: boolean = true;

    constructor(private conf: ServerConfig) {
        this.childServerProcess = spawn("java", [`-Xms${this.conf.memorySize}M`, `-Xmx${this.conf.memorySize}M`, "-jar", "server.jar", "nogui"]);
        this.setupCronJob();
        this.setupPipes();
    }

    private setupCronJob() {
        if (!this.conf.autoRestart.enabled) return;

        CronJob.from({
            cronTime: this.conf.autoRestart.cronTime,
            start: true,
            onTick: async () => { await this.restart(); },
            timeZone: this.conf.autoRestart.timeZone
        });
    }

    private setupPipes() {
        this.childServerProcess.stdout.on("data", data => console.log(data.toString()));
        this.childServerProcess.stderr.on("data", data => console.log(data.toString()));
        this.childServerProcess.on("close", data => console.log("Server process closed with code " + data));
    }

    start() {
        if (this.isRunning) {
            console.log("Server is already running.")
            return;
        }
        this.childServerProcess = spawn("java", [`-Xms${this.conf.memorySize}M`, `-Xmx${this.conf.memorySize}M`, "-jar", "server.jar", "nogui"]);
        this.isRunning = true;
        this.setupPipes();
    }

    async stop() {
        if (!this.isRunning) {
            console.log("Server is not running.");
            return;
        }
        return new Promise(resolve => {
            this.command("stop");
            this.isRunning = false;
            this.childServerProcess.on("close", resolve);
        });
    }

    async restart() {
        await this.stop();
        this.start();
    }

    command(cmd: string) {
        if (!this.isRunning) return;
        this.childServerProcess.stdin.write(cmd + "\n");
    }
}

interface ServerConfig {
    autoRestart: {
        enabled: boolean,
        cronTime: string,
        timeZone: string
    },
    memorySize: number;
}

async function serverConfigParser(): Promise<ServerConfig> {
    return await readFile("mwrap.json", "utf-8")
        .then(data => {
            console.log("Loaded config from json file.");
            return JSON.parse(data);
        })
        .catch(async () => {
            console.log("Couldn't load json. Loading creating and loading default config.");
            
            const defaultConfig = {
                memorySize: 4096,
                autoRestart: {
                    enabled: false,
                    cronTime: "0 3 * * *",
                    timeZone: "Europe/Berlin"
                }
            };

            await writeFile("mwrap.json", JSON.stringify(defaultConfig));
            return defaultConfig;
        });
}

main();