import { google } from "googleapis";
import { config } from "../config.js";

const auth = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI
);

auth.setCredentials({
    refresh_token: config.GOOGLE_REFRESH_TOKEN
});

function getParagraphText(paragraph: any): string {
    return (paragraph.elements ?? [])
        .map((e: any) => e.textRun?.content ?? "")
        .join("")
        .replace(/\n$/, "");
}

function findAllParagraphs(
    content: any[]
): Array<{ text: string; start: number; end: number }> {
    const paragraphs: Array<{ text: string; start: number; end: number }> = [];

    for (const el of content) {
        if (!el.paragraph || el.startIndex == null || el.endIndex == null) continue;

        const text = getParagraphText(el.paragraph);
        paragraphs.push({
            text,
            start: el.startIndex,
            end: el.endIndex - 1
        });
    }

    return paragraphs;
}

function makeParagraphStyleRequest(
    startIndex: number,
    endIndex: number,
    namedStyleType: string,
    alignment?: "CENTER" | "START" | "END" | "JUSTIFIED"
) {
    return {
        updateParagraphStyle: {
            range: { startIndex, endIndex },
            paragraphStyle: alignment
                ? { namedStyleType, alignment }
                : { namedStyleType },
            fields: alignment ? "namedStyleType,alignment" : "namedStyleType"
        }
    };
}

function makeBoldRange(startIndex: number, endIndex: number) {
    return {
        updateTextStyle: {
            range: { startIndex, endIndex },
            textStyle: { bold: true },
            fields: "bold"
        }
    };
}

export async function createDoc(title: string, content: string) {
    const docs = google.docs({ version: "v1", auth });

    const doc = await docs.documents.create({
        requestBody: { title }
    });

    const id = doc.data.documentId;
    if (!id) {
        throw new Error("No Google Doc ID returned");
    }

    // Insert all text
    await docs.documents.batchUpdate({
        documentId: id,
        requestBody: {
            requests: [
                {
                    insertText: {
                        location: { index: 1 },
                        text: content
                    }
                }
            ]
        }
    });

    // Pass 1: paragraph styles
    {
        const fullDoc = await docs.documents.get({ documentId: id });
        const bodyContent = fullDoc.data.body?.content ?? [];
        const paragraphs = findAllParagraphs(bodyContent);

        const requests: any[] = [];

        // Title
        const titleParagraph = paragraphs.find((p) => p.text === title);
        if (titleParagraph) {
            requests.push(
                makeParagraphStyleRequest(
                    titleParagraph.start,
                    titleParagraph.end,
                    "TITLE",
                    "CENTER"
                )
            );
        }

        // Subtitle
        const subtitleParagraph = paragraphs.find((p) =>
            /^Retrospective - \d{2}\/\d{2}\/\d{4}$/.test(p.text)
        );
        if (subtitleParagraph) {
            requests.push(
                makeParagraphStyleRequest(
                    subtitleParagraph.start,
                    subtitleParagraph.end,
                    "SUBTITLE",
                    "CENTER"
                )
            );
        }

        // Heading 3 sections
        const heading3Texts = ["TIMELINE", "TEAM STATS"];
        for (const p of paragraphs) {
            if (heading3Texts.includes(p.text)) {
                requests.push(
                    makeParagraphStyleRequest(p.start, p.end, "HEADING_3")
                );
            }
        }

        // Heading 1 sections
        const heading1Texts = [
            "Key Artifacts Generated:",
            "Business Value Created:",
            "Success Looks Like:",
            "What Went Well:",
            "What Didn't Go As Planned:",
            "What Should We Do Differently Next Time:"
        ];

        for (const p of paragraphs) {
            if (heading1Texts.includes(p.text)) {
                requests.push(
                    makeParagraphStyleRequest(p.start, p.end, "HEADING_1")
                );
            }
        }

        // Metadata lines as normal text
        const metadataPrefixes = [
            "Epic Timeline:",
            "Duration:",
            "Share of Year:",
            "Team Name:",
            "Average Cycle Time:",
            "Throughput:"
        ];

        for (const p of paragraphs) {
            if (metadataPrefixes.some((prefix) => p.text.startsWith(prefix))) {
                requests.push(
                    makeParagraphStyleRequest(p.start, p.end, "NORMAL_TEXT")
                );
            }
        }

        // Body text under heading 1 sections as normal text
        for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];

            const isTitle = p.text === title;
            const isSubtitle = /^Retrospective - \d{2}\/\d{2}\/\d{4}$/.test(p.text);
            const isHeading3 = heading3Texts.includes(p.text);
            const isMetadata = metadataPrefixes.some((prefix) =>
                p.text.startsWith(prefix)
            );
            const isHeading1 = heading1Texts.includes(p.text);

            if (isTitle || isSubtitle || isHeading3 || isMetadata || isHeading1) {
                continue;
            }

            const previousHeading1 = [...paragraphs]
                .slice(0, i)
                .reverse()
                .find((para) => heading1Texts.includes(para.text));

            if (previousHeading1 && p.text.trim() !== "") {
                requests.push(
                    makeParagraphStyleRequest(p.start, p.end, "NORMAL_TEXT")
                );
            }
        }

        if (requests.length > 0) {
            await docs.documents.batchUpdate({
                documentId: id,
                requestBody: { requests }
            });
        }
    }

    // Pass 2: bold metadata labels only
    {
        const refreshedDoc = await docs.documents.get({ documentId: id });
        const refreshedContent = refreshedDoc.data.body?.content ?? [];

        const boldPrefixes = [
            "Epic Timeline:",
            "Duration:",
            "Share of Year:",
            "Team Name:",
            "Average Cycle Time:",
            "Throughput:"
        ];

        const boldRequests: any[] = [];

        for (const el of refreshedContent) {
            if (!el.paragraph || el.startIndex == null) continue;

            const text = getParagraphText(el.paragraph);
            const prefix = boldPrefixes.find((p) => text.startsWith(p));
            if (!prefix) continue;

            const startIndex = el.startIndex;
            const endIndex = startIndex + prefix.length;

            boldRequests.push(makeBoldRange(startIndex, endIndex));
        }

        if (boldRequests.length > 0) {
            await docs.documents.batchUpdate({
                documentId: id,
                requestBody: { requests: boldRequests }
            });
        }
    }

    // Pass 3: convert lines starting with "- " into real bullets
    {
        const bulletDoc = await docs.documents.get({ documentId: id });
        const bulletContent = bulletDoc.data.body?.content ?? [];

        const bulletParagraphs: Array<{ start: number; end: number }> = [];

        for (const el of bulletContent) {
            if (!el.paragraph || el.startIndex == null || el.endIndex == null) continue;

            const text = getParagraphText(el.paragraph);

            if (text.startsWith("- ")) {
                bulletParagraphs.push({
                    start: el.startIndex,
                    end: el.endIndex - 1
                });
            }
        }

        const bulletRequests = bulletParagraphs.map((p) => ({
            createParagraphBullets: {
                range: {
                    startIndex: p.start,
                    endIndex: p.end
                },
                bulletPreset: "BULLET_DISC_CIRCLE_SQUARE"
            }
        }));

        if (bulletRequests.length > 0) {
            await docs.documents.batchUpdate({
                documentId: id,
                requestBody: { requests: bulletRequests }
            });
        }
    }

    // Pass 3b: remove the leading "- " from those bullet paragraphs
    {
        const cleanupDoc = await docs.documents.get({ documentId: id });
        const cleanupContent = cleanupDoc.data.body?.content ?? [];

        const deleteRequests: any[] = [];

        for (const el of cleanupContent) {
            if (!el.paragraph || el.startIndex == null) continue;

            const text = getParagraphText(el.paragraph);

            if (text.startsWith("- ")) {
                deleteRequests.push({
                    deleteContentRange: {
                        range: {
                            startIndex: el.startIndex,
                            endIndex: el.startIndex + 2
                        }
                    }
                });
            }
        }

        // Important: delete from bottom to top so earlier indexes do not shift
        deleteRequests.sort(
            (a, b) =>
                b.deleteContentRange.range.startIndex - a.deleteContentRange.range.startIndex
        );

        if (deleteRequests.length > 0) {
            await docs.documents.batchUpdate({
                documentId: id,
                requestBody: { requests: deleteRequests }
            });
        }
    }

    // Pass 4: add Jira links to keys like AJ-589
    {
        const linkedDoc = await docs.documents.get({ documentId: id });
        const linkedContent = linkedDoc.data.body?.content ?? [];
        const linkRequests: any[] = [];

        for (const el of linkedContent) {
            if (!el.paragraph || el.startIndex == null) continue;

            const text = getParagraphText(el.paragraph);
            const matches = [...text.matchAll(/\b([A-Z]+-\d+)\b/g)];

            for (const match of matches) {
                const key = match[1];
                const keyStartOffset = match.index;
                if (keyStartOffset == null) continue;

                const startIndex = el.startIndex + keyStartOffset;
                const endIndex = startIndex + key.length;

                linkRequests.push({
                    updateTextStyle: {
                        range: { startIndex, endIndex },
                        textStyle: {
                            link: {
                                url: `${config.JIRA_BASE_URL}/browse/${key}`
                            }
                        },
                        fields: "link"
                    }
                });
            }
        }

        if (linkRequests.length > 0) {
            await docs.documents.batchUpdate({
                documentId: id,
                requestBody: { requests: linkRequests }
            });
        }
    }

    return `https://docs.google.com/document/d/${id}`;
}