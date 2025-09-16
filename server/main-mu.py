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

# Optimized DPI settings for higher quality
HIGH_DPI = 600  # For high-res previews/crop coords
FINAL_OUTPUT_DPI = 900  # Increased for final TIFF output
STANDARD_DPI = 300  # For compatibility
CROP_TARGET_WIDTH = 900  # Low-res for frontend previews only
CROP_TARGET_HEIGHT = 1200

# A4 and A3 dimensions at different DPIs
A4_WIDTH_300DPI = 2480  # A4 at 300 DPI
A4_HEIGHT_300DPI = 3508
A4_WIDTH_600DPI = 4960  # A4 at 600 DPI
A4_HEIGHT_600DPI = 7016
A4_WIDTH_900DPI = 7440  # A4 at 900 DPI
A4_HEIGHT_900DPI = 10524
A3_WIDTH_PX = A4_WIDTH_300DPI * 2
A3_HEIGHT_PX = A4_HEIGHT_300DPI  # Landscape A3

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

class ProcessRequest(BaseModel):
    format: str
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

def crop_pdf_to_tiff_direct(file_id: str, page_number: int, crop_x: int, crop_y: int, crop_width: int, crop_height: int, output_dpi: int = FINAL_OUTPUT_DPI):
    """
    Directly crop from PDF to TIFF without intermediate image conversion for maximum quality
    """
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
        
        # Calculate zoom for high-quality output
        zoom = output_dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        
        # Convert crop coordinates from HIGH_DPI to PDF points, then scale for output DPI
        coord_zoom = HIGH_DPI / 72.0
        output_coord_scale = zoom / coord_zoom
        
        rect = fitz.Rect(
            crop_x / coord_zoom, 
            crop_y / coord_zoom, 
            (crop_x + crop_width) / coord_zoom, 
            (crop_y + crop_height) / coord_zoom
        )
        
        print(f"[Server] Direct PDF->TIFF: file={file_id}, page={page_number}, output_dpi={output_dpi}, pdf_dims={pdf_width}x{pdf_height}, crop_rect={rect}, zoom={zoom}")
        
        if rect.x1 > pdf_width or rect.y1 > pdf_height:
            doc.close()
            raise HTTPException(status_code=400, detail=f"Crop area exceeds page dimensions: rect={rect}, pdf_dims={pdf_width}x{pdf_height}")
        
        # Get high-quality pixmap directly from PDF
        pix = page.get_pixmap(matrix=mat, clip=rect, alpha=False, colorspace=fitz.csGRAY)
        
        # Convert to PIL Image for processing
        img = Image.frombytes("L", [pix.width, pix.height], pix.samples)
        
        # Apply optimized image processing for better quality
        img = ImageEnhance.Contrast(img).enhance(1.3)  # Slightly reduced contrast enhancement
        img = ImageEnhance.Sharpness(img).enhance(1.2)  # Add sharpness enhancement
        
        # Advanced thresholding for better quality
        img = img.point(lambda x: 0 if x < 140 else 255, mode="1")  # Slightly lower threshold
        
        doc.close()
        
        # Check image dimensions
        img_width, img_height = img.size
        if img_width <= 0 or img_height <= 0:
            print(f"[Server] Invalid image dimensions after cropping: {img_width}x{img_height}")
            raise HTTPException(status_code=400, detail="Invalid crop dimensions")

        print(f"[Server] Generated high-quality TIFF: mode={img.mode}, size={img.size}, dpi={output_dpi}")
        return img
        
    except Exception as e:
        print(f"[Server] Error in direct PDF->TIFF conversion for page {page_number}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to TIFF: {str(e)}")

def crop_pdf_page(file_id: str, page_number: int, crop_x: int, crop_y: int, crop_width: int, crop_height: int, is_preview: bool = False):
    """
    Legacy function for preview generation - maintains compatibility
    """
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

def process_single_pdf_crop_optimized(file_data, output_dpi: int = FINAL_OUTPUT_DPI):
    """
    Optimized function to process a single PDF crop directly to high-quality format
    """
    file_id = file_data.get("file_id")
    page_number = file_data.get("page_number")
    crop_data = file_data.get("crop", {})
    
    if not crop_data:
        raise HTTPException(status_code=400, detail="Missing crop data")
    
    crop_x = crop_data.get("x", 0)
    crop_y = crop_data.get("y", 0)
    crop_width = crop_data.get("width", 100)
    crop_height = crop_data.get("height", 100)

    if not all([file_id, page_number]):
        print(f"[Server] Missing file_id or page_number: {file_data}")
        raise HTTPException(status_code=400, detail="Missing file_id or page_number")

    return crop_pdf_to_tiff_direct(file_id, page_number, crop_x, crop_y, crop_width, crop_height, output_dpi)

def process_single_pdf_crop(file_data):
    """Legacy function for backwards compatibility"""
    file_id = file_data.get("file_id")
    page_number = file_data.get("page_number")
    crop_data = file_data.get("crop", {})
    
    if not crop_data:
        raise HTTPException(status_code=400, detail="Missing crop data")
    
    crop_x = crop_data.get("x", 0)
    crop_y = crop_data.get("y", 0)
    crop_width = crop_data.get("width", 100)
    crop_height = crop_data.get("height", 100)

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
        
        print(f"[Server] Processing PDF: file={file_id}, page={page_number}, pdf_dims={pdf_width}x{pdf_height}, crop_rect={rect}, zoom={zoom}")
        
        if rect.x1 > pdf_width or rect.y1 > pdf_height:
            doc.close()
            raise HTTPException(status_code=400, detail=f"Crop area exceeds page dimensions: rect={rect}, pdf_dims={pdf_width}x{pdf_height}")
        
        pix = page.get_pixmap(matrix=mat, clip=rect)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        doc.close()
        
        # Check image dimensions
        img_width, img_height = img.size
        if img_width <= 0 or img_height <= 0:
            print(f"[Server] Invalid image dimensions after cropping: {img_width}x{img_height}")
            raise HTTPException(status_code=400, detail="Invalid crop dimensions")

        # Process the image based on format
        processed_img = img.resize((CROP_TARGET_WIDTH, CROP_TARGET_HEIGHT), Image.Resampling.LANCZOS)
        processed_img = processed_img.convert("L")
        processed_img = ImageEnhance.Contrast(processed_img).enhance(1.5)
        processed_img = processed_img.point(lambda x: 0 if x < 150 else 255, mode="1")
        
        return processed_img
        
    except Exception as e:
        print(f"[Server] Error processing PDF {file_id} page {page_number}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")

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
            zoom = 200 / 72  # Low DPI for preview
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

@app.post("/process")
async def process_tiff(request: ProcessRequest):
    """Optimized endpoint to handle both A4 and A3 processing with direct PDF->TIFF conversion"""
    print(f"[Server] Received /process request: {request.dict()}")
    
    format_type = request.format
    files = request.files
    
    if format_type not in ["A4", "A3"]:
        raise HTTPException(status_code=400, detail="Format must be A4 or A3")
    
    if format_type == "A4" and len(files) != 1:
        raise HTTPException(status_code=400, detail="A4 format requires exactly one file")
    
    if format_type == "A3" and len(files) != 2:
        raise HTTPException(status_code=400, detail="A3 format requires exactly two files")

    try:
        images = []
        file_ids = []
        
        # Process each file using optimized direct PDF->TIFF conversion
        for file_data in files:
            processed_img = process_single_pdf_crop_optimized(file_data, FINAL_OUTPUT_DPI)
            images.append(processed_img)
            file_ids.append(file_data["file_id"].split("_")[0])

        # Create final TIFF based on format
        if format_type == "A4":
            # For A4, use the high-quality image directly
            final_img = images[0]
            # Optionally resize to standard A4 dimensions if needed
            # final_img = images[0].resize((A4_WIDTH_900DPI, A4_HEIGHT_900DPI), Image.Resampling.LANCZOS)
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            tiff_filename = f"AusNet_A4_{sanitize_filename(file_ids[0])}_{timestamp}.tiff"
        else:
            # For A3, merge two high-quality images side by side
            img1, img2 = images
            
            # Resize both images to same height to eliminate whitespace
            target_height = min(img1.height, img2.height)  # Use minimum height to avoid stretching
            
            # Resize images maintaining aspect ratio if needed
            if img1.height != target_height:
                aspect_ratio = img1.width / img1.height
                img1 = img1.resize((int(target_height * aspect_ratio), target_height), Image.Resampling.LANCZOS)
            
            if img2.height != target_height:
                aspect_ratio = img2.width / img2.height
                img2 = img2.resize((int(target_height * aspect_ratio), target_height), Image.Resampling.LANCZOS)
            
            total_width = img1.width + img2.width
            
            # Create final image with exact dimensions - no extra whitespace
            final_img = Image.new("1", (total_width, target_height), color=255)
            final_img.paste(img1, (0, 0))
            final_img.paste(img2, (img1.width, 0))
            
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            tiff_filename = f"AusNet_A3_{sanitize_filename(file_ids[0])}_{sanitize_filename(file_ids[1])}_{timestamp}.tiff"

        tiff_path = CROP_DIR / tiff_filename
        
        # Save with highest quality settings
        final_img.save(
            tiff_path, 
            format="TIFF", 
            compression="tiff_lzw",  # Lossless compression
            dpi=(FINAL_OUTPUT_DPI, FINAL_OUTPUT_DPI),
            optimize=True
        )

        response = {"tiff": f"/crops/{tiff_filename}"}
        print(f"[Server] Optimized process response: {response}")
        print(f"[Server] Generated high-quality {format_type} TIFF: mode={final_img.mode}, size={final_img.size}, dpi={FINAL_OUTPUT_DPI}")
        return response

    except Exception as e:
        print(f"[Server] Error processing optimized {format_type} TIFF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process {format_type} TIFF: {str(e)}")

@app.post("/merge")
async def merge_pdf(request: MergeRequest):
    """Legacy endpoint for backwards compatibility"""
    files = request.files
    if not files or len(files) != 2:
        raise HTTPException(status_code=400, detail="Exactly two files required")

    # Convert to new format and call optimized process endpoint
    process_request = ProcessRequest(
        format="A3",
        files=[
            {
                "file_id": file_data.get("file_id"),
                "page_number": file_data.get("page_number"),
                "crop": {
                    "x": file_data.get("crop_x", 0),
                    "y": file_data.get("crop_y", 0),
                    "width": file_data.get("crop_width", 100),
                    "height": file_data.get("crop_height", 100)
                }
            }
            for file_data in files
        ]
    )
    
    result = await process_tiff(process_request)
    # Convert response format for compatibility
    return {"tiff_file": result["tiff"]}

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