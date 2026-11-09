Uploaded Aadhaar image
        │
        ▼
Decode at native resolution
        │
        ├── ZXing
        └── jsQR
        │
        ▼
If failed → generate candidate crops
        │
        ├── centre crop
        ├── lower-right crop
        ├── lower-half crop
        ├── right-half crop
        └── tiled crops
        │
        ▼
For every candidate
        │
        ├── original
        ├── grayscale
        ├── contrast
        ├── threshold 100
        ├── threshold 128
        ├── threshold 160
        └── 2× / 3× upscale
        │
        ▼
ZXing TRY_HARDER
        │
        ▼
jsQR
        │
        ▼
Validate:
decimal-only + Aadhaar Secure QR length
