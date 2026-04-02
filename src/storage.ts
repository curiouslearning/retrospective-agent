import { Storage } from "@google-cloud/storage";
import { config } from "./config.js";

const storage = new Storage();
const OBJECT_NAME = "retrospectives.json";

export type StoredRetrospective = {
    epicKey: string;
    boardName: string;
    documentUrl: string;
    generatedAt: string;
};

function bucket() {
    return storage.bucket(config.STORAGE_BUCKET);
}

export async function loadRetrospectives(): Promise<StoredRetrospective[]> {
    const file = bucket().file(OBJECT_NAME);

    const [exists] = await file.exists();
    if (!exists) return [];

    const [contents] = await file.download();
    return JSON.parse(contents.toString("utf-8"));
}

export async function saveRetrospective(
    epicKey: string,
    boardName: string,
    documentUrl: string
): Promise<void> {
    const retrospectives = await loadRetrospectives();

    const existingIndex = retrospectives.findIndex((r) => r.epicKey === epicKey);

    const newEntry: StoredRetrospective = {
        epicKey,
        boardName,
        documentUrl,
        generatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
        retrospectives[existingIndex] = newEntry;
    } else {
        retrospectives.push(newEntry);
    }

    await bucket()
        .file(OBJECT_NAME)
        .save(JSON.stringify(retrospectives, null, 2), {
            contentType: "application/json",
        });
}

export async function getRetrospective(
    epicKey: string
): Promise<StoredRetrospective | null> {
    const retrospectives = await loadRetrospectives();
    return retrospectives.find((r) => r.epicKey === epicKey) ?? null;
}