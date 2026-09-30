import { spawn } from "node:child_process";
import fs from "fs/promises";
import { AppError } from "../../common/errors/AppError.js";
import { createRequire } from "node:module";
import path from "node:path";
const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
export async function extractTextFromFile(filePath: string, mimeType: string) {
    return extractTextFromBytes(await fs.readFile(filePath), filePath, mimeType);
}
export async function extractTextFromBytes(buffer: Buffer, filePath: string, mimeType: string) {
    const extension = path.extname(filePath).toLowerCase();
    if (mimeType === "application/pdf" || extension === ".pdf") {
        return parsePdf(buffer);
    }
    if (mimeType === "text/plain" ||
        mimeType === "text/markdown" ||
        extension === ".txt" ||
        extension === ".md" ||
        extension === ".markdown") {
        const content = buffer.toString("utf8");
        return cleanExtractedText(content);
    }
    throw new AppError("Unsupported document type", 400);
}
function cleanExtractedText(text: string) {
    return text
        .replace(/\r\n/g, "\n")
        .replace(/\t/g, " ")
        .replace(/[ ]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
// A separate process contains native parser crashes as well as CPU-heavy malformed PDFs.
async function parsePdf(buffer: Buffer): Promise<string> {
    const script = `
  const chunks=[];process.stdin.on("data",chunk=>chunks.push(chunk));
  process.stdin.on("end",()=>{(async()=>{const {PDFParse}=require(process.argv[1]);const parser=new PDFParse({data:Buffer.concat(chunks),verbosity:0});try{const result=await parser.getText();if(result.text.length>2000000)throw new Error();process.send({text:result.text});}finally{await parser.destroy();}})().catch(()=>process.send({failed:true}));});
 `;
    const child = spawn(process.execPath, ["--max-old-space-size=128", "-e", script, nodeRequire.resolve("pdf-parse")], { stdio: ["pipe", "ignore", "ignore", "ipc"], windowsHide: true });
    let timer: NodeJS.Timeout | undefined;
    try {
        return await new Promise<string>((resolve, reject) => {
            const fail = () => reject(new AppError("PDF could not be parsed within resource limits", 400));
            timer = setTimeout(fail, 10000);
            child.once("error", fail);
            child.once("exit", fail);
            child.stdin!.on("error", fail);
            child.once("message", (result: {
                text?: string;
                failed?: boolean;
            }) => { if (typeof result.text !== "string" || result.text.length > 2000000)
                fail();
            else
                resolve(cleanExtractedText(result.text)); });
            child.stdin!.end(buffer);
        });
    }
    finally {
        if (timer)
            clearTimeout(timer);
        child.kill();
    }
}
