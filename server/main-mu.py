from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pypdf import PdfReader
from PIL import Image, ImageEnhance
import fitz
import io
import os
import uuid
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import logging
import re
from pydantic import BaseModel

logging.getLogger("pypdf").setLevel(logging.ERROR)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:3000", "http://localhost:5173", "file://*","https://ausnetpdfconverter.netlify.app/"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
PREVIEW_DIR = Path("previews")
CROP_DIR = Path("crops")
UPLOAD_DIR.mkdir(exist_ok=True)
PREVIEW_DIR.mkdir(exist_ok=True)
CROP_DIR.mkdir(exist_ok=True)

HIGH_DPI = 600  # High DPI for quality rendering
STANDARD_DPI = 300
CROP_TARGET_WIDTH = 900
CROP_TARGET_HEIGHT = 1200

class PreviewPageRequest(BaseModel):
    file_id: str
    page_number: int

class CropRequest(BaseModel):
    file_id: str
    page_number: int
    crop_x: int
    crop_y: int
    crop_width: int
    crop_height: int

class MergeRequest(BaseModel):
    files: list[dict]

def sanitize_filename(name: str) -> str:
    return re.sub(r'[^\w\-_\.]', '_', name)

def get_pdf_page_dimensions(pdf_path: Path, page_number: int):
    try:
        doc = fitz.open(pdf_path)
        if doc.page_count == 0:
            doc.close()
            raise ValueError("PDF has no pages")
        
        page_index = page_number - 1
        if page_index < 0 or page_index >= doc.page_count:
            doc.close()
            raise ValueError(f"Page {page_number} does not exist")
        
        page = doc[page_index]
        if page is None:
            doc.close()
            raise ValueError(f"Could not load page {page_number}")
        
        rect = page.rect
        doc.close()
        return rect.width, rect.height
    except Exception as e:
        print(f"[Server] Error getting PDF page dimensions: {str(e)}")
        raise

def crop_pdf_page(file_id: str, page_number: int, crop_x: int, crop_y: int, crop_width: int, crop_height: int, is_preview: bool = False):
    pdf_path = UPLOAD_DIR / f"{file_id}.pdf"
    if not pdf_path.exists():
        print(f"[Server] PDF not found: {file_id}")
        raise HTTPException(status_code=404, detail=f"PDF not found: {file_id}")

    if page_number < 1:
        print(f"[Server] Invalid page number: {page_number}")
        raise HTTPException(status_code=400, detail=f"Invalid page number: {page_number}")

    if any(v < 0 for v in [crop_x, crop_y, crop_width, crop_height]):
        print(f"[Server] Invalid crop coordinates: x={crop_x}, y={crop_y}, w={crop_width}, h={crop_height}")
        raise HTTPException(status_code=400, detail="Crop coordinates cannot be negative")

    try:
        pdf_reader = PdfReader(pdf_path, strict=False)
        total_pages = len(pdf_reader.pages)
        if page_number > total_pages:
            print(f"[Server] Page number {page_number} exceeds total pages {total_pages}")
            raise HTTPException(status_code=400, detail=f"Page number {page_number} exceeds total pages {total_pages}")
    except Exception as e:
        print(f"[Server] Error validating page number: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to validate page number: {str(e)}")

    try:
        doc = fitz.open(pdf_path)
        page = doc[page_number - 1]
        pdf_width, pdf_height = get_pdf_page_dimensions(pdf_path, page_number)
        zoom = HIGH_DPI / 72
        mat = fitz.Matrix(zoom, zoom)
        rect = fitz.Rect(crop_x / zoom, crop_y / zoom, (crop_x + crop_width) / zoom, (crop_y + crop_height) / zoom)
        
        print(f"[Server] Cropping PDF: file={file_id}, page={page_number}, pdf_dims={pdf_width}x{pdf_height}, crop_rect={rect}, zoom={zoom}")
        
        if rect.x1 > pdf_width or rect.y1 > pdf_height:
            doc.close()
            raise HTTPException(status_code=400, detail=f"Crop area exceeds page dimensions: rect={rect}, pdf_dims={pdf_width}x{pdf_height}")
        
        pix = page.get_pixmap(matrix=mat, clip=rect)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        img = img.resize((CROP_TARGET_WIDTH, CROP_TARGET_HEIGHT), Image.Resampling.LANCZOS)
        if not is_preview:
            img = img.convert("L")
            img = ImageEnhance.Contrast(img).enhance(1.5)
            img = img.point(lambda x: 0 if x < 150 else 255, mode="1")  # Adaptive thresholding
        output_path = (PREVIEW_DIR if is_preview else CROP_DIR) / f"{file_id}_page{page_number}_{'preview' if is_preview else 'cropped'}.png"
        img.save(output_path, "PNG")
        doc.close()

        response = {
            "preview" if is_preview else "cropped_image": f"/{'previews' if is_preview else 'crops'}/{file_id}_page{page_number}_{'preview' if is_preview else 'cropped'}.png",
            "width": CROP_TARGET_WIDTH,
            "height": CROP_TARGET_HEIGHT
        }
        print(f"[Server] Crop response: {response}")
        return response
    except Exception as e:
        print(f"[Server] Error cropping image for page {page_number}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to crop image: {str(e)}")

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.content_type == "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    max_size = 10 * 1024 * 1024
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="File size must be less than 10MB")

    try:
        file_id = f"{uuid.uuid4()}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        pdf_path = UPLOAD_DIR / f"{file_id}.pdf"
        with open(pdf_path, "wb") as f:
            f.write(content)

        try:
            pdf_reader = PdfReader(pdf_path, strict=False)
            total_pages = len(pdf_reader.pages)
        except Exception as e:
            print(f"[Server] Error reading PDF pages: {str(e)}")
            total_pages = 1

        preview_path = PREVIEW_DIR / f"{file_id}_page1.png"
        try:
            doc = fitz.open(stream=content, filetype="pdf")
            page = doc[0]  # First page
            zoom = 100 / 72  # Low DPI for preview
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img = img.resize((200, int(200 * pix.height / pix.width)), Image.Resampling.LANCZOS)
            img.save(preview_path, "PNG")
            doc.close()
        except Exception as e:
            print(f"[Server] Error generating preview: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to generate preview: {str(e)}")

        response = {
            "fileId": file_id,
            "filePath": str(pdf_path),
            "preview": f"/previews/{file_id}_page1.png",
            "totalPages": total_pages,
            "pageNumber": 1
        }
        print(f"[Server] Upload response: {response}")
        return response
    except Exception as e:
        print(f"[Server] Error processing PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")

@app.get("/previews/{filename}")
async def get_preview(filename: str):
    preview_path = PREVIEW_DIR / filename
    if not preview_path.exists():
        print(f"[Server] Preview not found: {filename}")
        raise HTTPException(status_code=404, detail="Preview not found")
    print(f"[Server] Serving preview: {filename}")
    return FileResponse(preview_path)

@app.get("/crops/{filename}")
async def get_cropped_image(filename: str):
    crop_path = CROP_DIR / filename
    if not crop_path.exists():
        print(f"[Server] Cropped image not found: {filename}")
        raise HTTPException(status_code=404, detail="Cropped image not found")
    print(f"[Server] Serving cropped image: {filename}")
    return FileResponse(crop_path)

@app.post("/preview_page")
async def generate_preview_page(request: PreviewPageRequest):
    print(f"[Server] Received /preview_page request: {request.dict()}")
    file_id = request.file_id
    page_number = request.page_number

    pdf_path = UPLOAD_DIR / f"{file_id}.pdf"
    if not pdf_path.exists():
        print(f"[Server] PDF not found: {file_id}")
        raise HTTPException(status_code=404, detail=f"PDF not found: {file_id}")

    if page_number < 1:
        print(f"[Server] Invalid page number: {page_number}")
        raise HTTPException(status_code=400, detail=f"Invalid page number: {page_number}")

    try:
        pdf_reader = PdfReader(pdf_path, strict=False)
        total_pages = len(pdf_reader.pages)
        if page_number > total_pages:
            print(f"[Server] Page number {page_number} exceeds total pages {total_pages}")
            raise HTTPException(status_code=400, detail=f"Page number {page_number} exceeds total pages {total_pages}")
    except Exception as e:
        print(f"[Server] Error validating page number: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to validate page number: {str(e)}")

    try:
        preview_path = PREVIEW_DIR / f"{file_id}_page{page_number}.png"
        if not preview_path.exists():
            doc = fitz.open(pdf_path)
            page = doc[page_number - 1]
            zoom = 100 / 72  # Low DPI for preview
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img = img.resize((200, int(200 * pix.height / pix.width)), Image.Resampling.LANCZOS)
            img.save(preview_path, "PNG")
            doc.close()
        response = {"preview": f"/previews/{file_id}_page{page_number}.png"}
        print(f"[Server] Preview page response: {response}")
        return response
    except Exception as e:
        print(f"[Server] Error generating preview for page {page_number}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate preview for page {page_number}: {str(e)}")

@app.post("/high_res_preview")
async def generate_high_res_preview(request: PreviewPageRequest):
    print(f"[Server] Received /high_res_preview request: {request.dict()}")
    file_id = request.file_id
    page_number = request.page_number

    pdf_path = UPLOAD_DIR / f"{file_id}.pdf"
    if not pdf_path.exists():
        print(f"[Server] PDF not found: {file_id}")
        raise HTTPException(status_code=404, detail=f"PDF not found: {file_id}")

    if page_number < 1:
        print(f"[Server] Invalid page number: {page_number}")
        raise HTTPException(status_code=400, detail=f"Invalid page number: {page_number}")

    try:
        pdf_reader = PdfReader(pdf_path, strict=False)
        total_pages = len(pdf_reader.pages)
        if page_number > total_pages:
            print(f"[Server] Page number {page_number} exceeds total pages {total_pages}")
            raise HTTPException(status_code=400, detail=f"Page number {page_number} exceeds total pages {total_pages}")
    except Exception as e:
        print(f"[Server] Error validating page number: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to validate page number: {str(e)}")

    try:
        preview_path = PREVIEW_DIR / f"{file_id}_page{page_number}_highres.png"
        if not preview_path.exists():
            doc = fitz.open(pdf_path)
            page = doc[page_number - 1]
            zoom = HIGH_DPI / 72
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img.save(preview_path, "PNG")
            doc.close()
        response = {"preview": f"/previews/{file_id}_page{page_number}_highres.png"}
        print(f"[Server] High-res preview response: {response}")
        return response
    except Exception as e:
        print(f"[Server] Error generating high-res preview for page {page_number}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate high-res preview: {str(e)}")

@app.post("/crop_preview")
async def crop_preview(request: CropRequest):
    print(f"[Server] Received /crop_preview request: {request.dict()}")
    return crop_pdf_page(
        file_id=request.file_id,
        page_number=request.page_number,
        crop_x=request.crop_x,
        crop_y=request.crop_y,
        crop_width=request.crop_width,
        crop_height=request.crop_height,
        is_preview=True
    )

@app.post("/crop")
async def crop_image(request: CropRequest):
    print(f"[Server] Received /crop request: {request.dict()}")
    return crop_pdf_page(
        file_id=request.file_id,
        page_number=request.page_number,
        crop_x=request.crop_x,
        crop_y=request.crop_y,
        crop_width=request.crop_width,
        crop_height=request.crop_height,
        is_preview=False
    )

@app.post("/merge")
async def merge_pdf(request: MergeRequest):
    files = request.files
    if not files or len(files) != 2:
        raise HTTPException(status_code=400, detail="Exactly two files required")

    images = []
    for file_data in files:
        file_id = file_data.get("file_id")
        page_number = file_data.get("page_number")
        crop_x = file_data.get("crop_x", 0)
        crop_y = file_data.get("crop_y", 0)
        crop_width = file_data.get("crop_width", 100)
        crop_height = file_data.get("crop_height", 100)

        if not all([file_id, page_number]):
            print(f"[Server] Missing file_id or page_number: {file_data}")
            raise HTTPException(status_code=400, detail="Missing file_id or page_number")

        pdf_path = UPLOAD_DIR / f"{file_id}.pdf"
        if not pdf_path.exists():
            print(f"[Server] PDF not found: {file_id}")
            raise HTTPException(status_code=404, detail=f"PDF not found: {file_id}")

        try:
            pdf_reader = PdfReader(pdf_path, strict=False)
            total_pages = len(pdf_reader.pages)
            if page_number > total_pages:
                print(f"[Server] Page number {page_number} exceeds total pages {total_pages}")
                raise HTTPException(status_code=400, detail=f"Page number {page_number} exceeds total pages {total_pages}")
        except Exception as e:
            print(f"[Server] Error validating page number: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to validate page number: {str(e)}")

        try:
            doc = fitz.open(pdf_path)
            page = doc[page_number - 1]
            pdf_width, pdf_height = get_pdf_page_dimensions(pdf_path, page_number)
            zoom = HIGH_DPI / 72
            mat = fitz.Matrix(zoom, zoom)
            rect = fitz.Rect(crop_x / zoom, crop_y / zoom, (crop_x + crop_width) / zoom, (crop_y + crop_height) / zoom)
            
            print(f"[Server] Merging PDF: file={file_id}, page={page_number}, pdf_dims={pdf_width}x{pdf_height}, crop_rect={rect}, zoom={zoom}")
            
            if rect.x1 > pdf_width or rect.y1 > pdf_height:
                doc.close()
                raise HTTPException(status_code=400, detail=f"Crop area exceeds page dimensions: rect={rect}, pdf_dims={pdf_width}x{pdf_height}")
            
            pix = page.get_pixmap(matrix=mat, clip=rect)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img_width, img_height = img.size

            if img_width <= 0 or img_height <= 0:
                print(f"[Server] Invalid image dimensions after cropping: нужно указать ширину и высоту {img_width}x{img_height}")
                raise HTTPException(status_code=400, detail="Invalid crop dimensions")

            cropped_img = img.resize((CROP_TARGET_WIDTH, CROP_TARGET_HEIGHT), Image.Resampling.LANCZOS)
            cropped_img = cropped_img.convert("L")
            cropped_img = ImageEnhance.Contrast(cropped_img).enhance(1.5)
            cropped_img = cropped_img.point(lambda x: 0 if x < 150 else 255, mode="1")
            images.append(cropped_img)
            doc.close()
        except Exception as e:
            print(f"[Server] Error processing PDF {file_id} page {page_number}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")

    merged_img = Image.new("1", (CROP_TARGET_WIDTH * 2, CROP_TARGET_HEIGHT), color=255)
    x_offset = 0
    for img in images:
        merged_img.paste(img, (x_offset, 0))
        x_offset += img.width

    pdf_names = [sanitize_filename(file_data["file_id"].split("_")[0]) for file_data in files]
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    tiff_filename = f"AusNet_{pdf_names[0]}_{pdf_names[1]}_{timestamp}.tiff"
    tiff_path = CROP_DIR / tiff_filename

    merged_img.save(tiff_path, format="TIFF", compression="tiff_lzw", dpi=(STANDARD_DPI, STANDARD_DPI))

    response = {"tiff_file": f"/crops/{tiff_filename}"}
    print(f"[Server] Merge response: {response}")
    print(f"[Server] Merged TIFF details: mode={merged_img.mode}, size={merged_img.size}, dpi={merged_img.info.get('dpi')}")
    return response

@app.on_event("startup")
async def cleanup_old_files():
    max_age = 7200
    now = datetime.now().timestamp()
    for dir_path in [UPLOAD_DIR, PREVIEW_DIR, CROP_DIR]:
        for file_path in dir_path.iterdir():
            if now - file_path.stat().st_mtime > max_age:
                print(f"[Server] Deleting old file: {file_path}")
                file_path.unlink()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4000)