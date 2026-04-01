import fs from "fs/promises";
import path from "path";

const STORAGE_FILE = path.join(process.cwd(), "retrospectives.json");

export type StoredRetrospective = {
    epicKey: string;
    boardName: string;
    documentUrl: string;
    generatedAt: string;
};

export async function loadRetrospectives(): Promise<StoredRetrospective[]> {
    try {
        const data = await fs.readFile(STORAGE_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error: any) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

export async function saveRetrospective(
    epicKey: string,
    boardName: string,
    documentUrl: string
): Promise<void> {
    const retrospectives = await loadRetrospectives();
    
    const existingIndex = retrospectives.findIndex(r => r.epicKey === epicKey);
    
    const newEntry: StoredRetrospective = {
        epicKey,
        boardName,
        documentUrl,
        generatedAt: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
        retrospectives[existingIndex] = newEntry;
    } else {
        retrospectives.push(newEntry);
    }
    
    await fs.writeFile(STORAGE_FILE, JSON.stringify(retrospectives, null, 2), "utf-8");
}

export async function getRetrospective(epicKey: string): Promise<StoredRetrospective | null> {
    const retrospectives = await loadRetrospectives();
    return retrospectives.find(r => r.epicKey === epicKey) || null;
}
