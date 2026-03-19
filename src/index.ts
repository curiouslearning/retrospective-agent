import express from "express";
import { config } from "./config.js";
import { buildRetrospective } from "./tools/buildRetrospective.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.post("/run", async (req, res) => {
    try {
        const { board_name, epic_key } = req.body;

        const result = await buildRetrospective({
            board_name,
            epic_key
        });

        res.json(result);
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(config.PORT, () => {
    console.log(`Server running on http://localhost:${config.PORT}`);
});