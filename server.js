import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import Replicate from 'replicate';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase (Optional for local, required for prod)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ROBUST STATIC SERVING
const publicPath = path.join(__dirname, 'public');
const distPath = path.join(__dirname, 'dist');

app.use(express.static(distPath));
app.use(express.static(publicPath));

console.log(`Serving static files from: ${distPath} and ${publicPath}`);

// Manejar la página de ventas en el dominio principal
app.get('/', (req, res) => {
    const hostname = req.hostname;
    // Si es el dominio principal, mostrar la página de ventas
    if (hostname === 'sharephoto.fun' || hostname === 'www.sharephoto.fun') {
        res.sendFile(path.join(publicPath, 'sales.html'));
    } else {
        // Para subdominios, mostrar la app principal
        res.sendFile(path.join(distPath, 'index.html'), (err) => {
            if (err) res.sendFile(path.join(publicPath, 'index.html'));
        });
    }
});

// Manejar rutas de landings (/l/nombre-landing)
app.get('/l/:landingId', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) res.sendFile(path.join(publicPath, 'index.html'));
    });
});

const GALLERY_JSON = path.join(__dirname, 'gallery.json');
const GALLERY_DIR = path.join(__dirname, 'public', 'gallery');

// Ensure directories exist
try {
    await fs.mkdir(GALLERY_DIR, { recursive: true });
    console.log(`Gallery directory ready: ${GALLERY_DIR}`);
} catch (err) {
    console.error("Error creating gallery dir:", err);
}

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.post('/api/generate', async (req, res) => {
    console.log("--- AI Generation Request ---");
    try {
        const { image, filterFile } = req.body;
        if (!image) return res.status(400).json({ error: "Image is required" });

        if (!process.env.REPLICATE_API_TOKEN) {
            console.warn("REPLICATE_API_TOKEN missing. Using simulation.");
            return res.json({ imageUrl: '/dragon_mascot.png' });
        }

        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
        const filtersDir = path.join(__dirname, 'filters');
        
        let selectedPrompt = "High-quality Pixar style transformation";
        try {
            const fileName = filterFile || 'party.md';
            const filePath = path.join(filtersDir, fileName);
            selectedPrompt = fsSync.readFileSync(filePath, 'utf8').trim();
            console.log(`Using selected filter: ${fileName}`);
        } catch (e) {
            console.warn("Filter not found, using fallback.");
        }

        console.log("Calling SDXL for stable transformation...");
        const output = await replicate.run(
            "xai/grok-imagine-image",
            {
                input: {
                    image: image,
                    prompt: selectedPrompt,
                    aspect_ratio: "1:1"
                }
            }
        );

        if (!output) {
            throw new Error("No output from Replicate");
        }

        let generatedUrl;
        if (Array.isArray(output)) {
            generatedUrl = output[0];
        } else if (typeof output === 'string') {
            generatedUrl = output;
        } else if (output && typeof output.url === 'function') {
            generatedUrl = output.url();
        } else if (output && output.url) {
            generatedUrl = output.url;
        } else {
            generatedUrl = output;
        }

        console.log("Resolved Generated URL:", generatedUrl);

        // LOCAL CACHE TO PREVENT BROKEN LINKS
        try {
            const tempFileName = `preview_${Date.now()}.png`;
            const tempFilePath = path.join(publicPath, tempFileName);

            let buffer;
            // Handle various possible formats from Replicate
            if (typeof generatedUrl === 'string' && generatedUrl.startsWith('http')) {
                const imgResponse = await fetch(generatedUrl);
                if (!imgResponse.ok) throw new Error(`Fetch failed with status ${imgResponse.status}`);
                buffer = Buffer.from(await imgResponse.arrayBuffer());
            } else if (generatedUrl && typeof generatedUrl.url === 'string') {
                const imgResponse = await fetch(generatedUrl.url);
                buffer = Buffer.from(await imgResponse.arrayBuffer());
            } else if (generatedUrl instanceof ReadableStream || (generatedUrl && typeof generatedUrl.getReader === 'function')) {
                const reader = generatedUrl.getReader();
                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }
                buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
            } else if (generatedUrl && typeof generatedUrl.toString === 'function' && generatedUrl.toString().startsWith('http')) {
                const imgResponse = await fetch(generatedUrl.toString());
                buffer = Buffer.from(await imgResponse.arrayBuffer());
            } else {
                console.error("DEBUG: Replicate output structure:", JSON.stringify(generatedUrl, null, 2) || generatedUrl);
                throw new Error("Unknown output format from Replicate");
            }

            await fs.writeFile(tempFilePath, buffer);
            generatedUrl = `/${tempFileName}`;
            console.log("Successfully cached locally:", generatedUrl);
        } catch (downloadErr) {
            console.error("Local cache download error:", downloadErr.message);
        }

        res.json({ imageUrl: generatedUrl });
    } catch (error) {
        console.error("CRITICAL AI Error:", error.message);
        res.status(500).json({
            error: error.message,
            imageUrl: null
        });
    }
});

app.post('/api/gallery', async (req, res) => {
    try {
        const { imageUrl, landingId } = req.body;
        if (!imageUrl) return res.status(400).json({ error: 'No image URL' });
        const currentLanding = landingId || 'default';

        if (supabase) {
            console.log(`--- Saving to Supabase for landing: ${currentLanding} ---`);
            let publicUrl = imageUrl;

            // ALWAYS upload to Supabase Storage
            try {
                let buffer;
                let contentType = 'image/png';

                if (imageUrl.startsWith('data:image')) {
                    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
                    buffer = Buffer.from(base64Data, 'base64');
                } else if (imageUrl.startsWith('http')) {
                    const imgRes = await fetch(imageUrl);
                    buffer = Buffer.from(await imgRes.arrayBuffer());
                    contentType = imgRes.headers.get('content-type') || 'image/png';
                } else {
                    const sourcePath = path.join(publicPath, imageUrl);
                    buffer = await fs.readFile(sourcePath);
                }

                // ORGANIZAR POR CARPETA DE LANDING
                const fileName = `${currentLanding}/dragon_${Date.now()}.png`;
                console.log(`Uploading to path: gallery/${fileName}`);

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('gallery')
                    .upload(fileName, buffer, { contentType, upsert: true });

                if (uploadError) {
                    console.error("Supabase Storage Error:", uploadError);
                    throw new Error(`Storage Error: ${uploadError.message}`);
                }

                const { data: urlData } = supabase.storage
                    .from('gallery')
                    .getPublicUrl(fileName);

                publicUrl = urlData.publicUrl;
                console.log("Supabase Public URL:", publicUrl);
            } catch (storageErr) {
                console.error("Storage Step Failed:", storageErr.message);
                // Continue if it was already a public URL, otherwise fail
                if (!imageUrl.startsWith('http')) throw storageErr;
            }

            // 2. Insert into DB
            console.log("Inserting record into 'gallery' table...");
            const { data, error } = await supabase
                .from('gallery')
                .insert([{ url: publicUrl, landing_id: currentLanding }])
                .select();

            if (error) {
                console.error("Supabase DB Error:", error);
                throw new Error(`Database Error: ${error.message}`);
            }

            console.log("Successfully saved to Supabase!");
            return res.json({ success: true, item: data[0] });
        }

        // FALLBACK TO LOCAL (for local dev)
        const fileName = `shared_${Date.now()}.png`;
        const filePath = path.join(GALLERY_DIR, fileName);
        const publicRelativePath = `/gallery/${fileName}`;

        if (imageUrl.startsWith('http')) {
            const response = await fetch(imageUrl);
            const buffer = Buffer.from(await response.arrayBuffer());
            await fs.writeFile(filePath, buffer);
        } else if (imageUrl.startsWith('data:image')) {
            const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
            await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
        } else if (imageUrl.startsWith('/')) {
            const sourcePath = path.join(publicPath, imageUrl);
            await fs.copyFile(sourcePath, filePath);
        }

        let galleryData = [];
        try {
            const existing = await fs.readFile(GALLERY_JSON, 'utf-8');
            galleryData = JSON.parse(existing);
        } catch (e) { }

        galleryData.unshift({
            id: Date.now(),
            url: publicRelativePath,
            timestamp: new Date().toISOString()
        });

        await fs.writeFile(GALLERY_JSON, JSON.stringify(galleryData, null, 2));
        res.json({ success: true, item: galleryData[0] });

    } catch (error) {
        console.error("Gallery Save Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/gallery', async (req, res) => {
    try {
        const { landingId } = req.query;
        const currentLanding = landingId || 'default';

        if (supabase) {
            const { data, error } = await supabase
                .from('gallery')
                .select('*')
                .eq('landing_id', currentLanding)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return res.json(data);
        }

        const data = await fs.readFile(GALLERY_JSON, 'utf-8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.json([]);
    }
});

app.delete('/api/gallery/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (supabase) {
            const { error } = await supabase
                .from('gallery')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return res.json({ success: true });
        }
        res.status(501).json({ error: "Local delete not implemented" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.use((req, res) => {
    console.warn(`404 Not Found: ${req.method} ${req.url}`);
    res.status(404).send('Not Found');
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend server running at http://localhost:${PORT}`);
});
