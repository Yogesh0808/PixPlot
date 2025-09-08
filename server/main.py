from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pypdf import PdfReader
from pdf2image import convert_from_bytes
from PIL import Image, ImageEnhance, ImageFilter
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
    allow_origins=["http://localhost:8080", "http://localhost:3000", "http://localhost:5173"],
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

# Optimized DPI settings
HIGH_DPI = 900  # Increased from 600 for better quality
STANDARD_DPI = 300
PREVIEW_DPI = 150  # Lower DPI for faster previews
FINAL_TIFF_DPI = 600  # High DPI for final TIFF output

# Target dimensions for different use cases
CROP_TARGET_WIDTH = 900
CROP_TARGET_HEIGHT = 1200
FINAL_TIFF_WIDTH = 1800  # Higher resolution for final output
FINAL_TIFF_HEIGHT = 2400

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

def apply_image_enhancement(img: Image.Image, is_final_output: bool = False) -> Image.Image:
    """Apply different enhancement based on whether it's for preview or final output"""
    if is_final_output:
        # High-quality processing for final TIFF
        if img.mode != 'L':
            img = img.convert('L')
        
        # Apply subtle Gaussian blur to soften the image
        img = img.filter(ImageFilter.GaussianBlur(radius=0.8))
        
        # Enhanced contrast with more subtle adjustment
        img = ImageEnhance.Contrast(img).enhance(1.3)
        
        # Improved brightness adjustment
        img = ImageEnhance.Brightness(img).enhance(1.1)
        
        # More sophisticated thresholding for better quality
        # Use adaptive thresholding with a higher threshold for cleaner lines
        img = img.point(lambda x: 0 if x < 128 else 255, mode="1")
        
        return img
    else:
        # Fast processing for previews
        if img.mode != 'L':
            img = img.convert('L')
        
        # Simple contrast enhancement for preview
        img = ImageEnhance.Contrast(img).enhance(1.2)
        
        return img

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
        
        # Use different DPI based on purpose
        dpi = PREVIEW_DPI if is_preview else HIGH_DPI
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        
        # The crop coordinates are from the frontend in screen coordinates
        # We need to convert them to PDF coordinates first, then to pixmap coordinates
        # Assume crop coordinates are based on a reference DPI (like the high-res preview)
        reference_zoom = HIGH_DPI / 72
        
        # Convert screen coordinates to PDF coordinates
        pdf_crop_x = crop_x / reference_zoom
        pdf_crop_y = crop_y / reference_zoom
        pdf_crop_width = crop_width / reference_zoom
        pdf_crop_height = crop_height / reference_zoom
        
        # Create the rectangle in PDF coordinates
        rect = fitz.Rect(pdf_crop_x, pdf_crop_y, pdf_crop_x + pdf_crop_width, pdf_crop_y + pdf_crop_height)
        
        print(f"[Server] Cropping PDF: file={file_id}, page={page_number}")
        print(f"[Server] PDF dims: {pdf_width}x{pdf_height}")
        print(f"[Server] Input crop: x={crop_x}, y={crop_y}, w={crop_width}, h={crop_height}")
        print(f"[Server] PDF crop rect: {rect}")
        print(f"[Server] DPI: {dpi}, zoom: {zoom}")
        
        # Validate crop area against PDF dimensions
        if rect.x0 < 0 or rect.y0 < 0:
            doc.close()
            raise HTTPException(status_code=400, detail=f"Crop area starts outside page boundaries: rect={rect}")
        
        if rect.x1 > pdf_width or rect.y1 > pdf_height:
            doc.close()
            print(f"[Server] Crop exceeds page: rect.x1={rect.x1} > pdf_width={pdf_width} or rect.y1={rect.y1} > pdf_height={pdf_height}")
            raise HTTPException(status_code=400, detail=f"Crop area exceeds page dimensions: rect={rect}, pdf_dims={pdf_width}x{pdf_height}")
        
        # Get pixmap with the crop rectangle
        pix = page.get_pixmap(matrix=mat, clip=rect)
        
        if pix.width <= 0 or pix.height <= 0:
            doc.close()
            raise HTTPException(status_code=400, detail=f"Invalid crop resulted in zero-sized image: {pix.width}x{pix.height}")
        
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        
        # Resize to appropriate target dimensions
        target_width = CROP_TARGET_WIDTH
        target_height = CROP_TARGET_HEIGHT
        
        img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
        
        # Apply enhancement based on purpose
        if not is_preview:
            img = apply_image_enhancement(img, is_final_output=False)
        
        output_path = (PREVIEW_DIR if is_preview else CROP_DIR) / f"{file_id}_page{page_number}_{'preview' if is_preview else 'cropped'}.png"
        
        # Use different compression for preview vs crop
        if is_preview:
            img.save(output_path, "PNG", optimize=True, compress_level=9)
        else:
            img.save(output_path, "PNG", compress_level=1)  # Less compression for better quality
        
        doc.close()

        response = {
            "preview" if is_preview else "cropped_image": f"/{'previews' if is_preview else 'crops'}/{file_id}_page{page_number}_{'preview' if is_preview else 'cropped'}.png",
            "width": target_width,
            "height": target_height
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
            # Use lower DPI for faster preview generation
            images = convert_from_bytes(content, first_page=1, last_page=1, dpi=100, size=(200, None))
            if not images:
                raise Exception("No images generated")
            images[0].save(preview_path, "PNG", optimize=True)
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
            with open(pdf_path, "rb") as f:
                content = f.read()
            # Use optimized settings for preview generation
            images = convert_from_bytes(content, first_page=page_number, last_page=page_number, dpi=100, size=(200, None))
            if not images:
                raise Exception("No images generated")
            images[0].save(preview_path, "PNG", optimize=True)
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
            # Use medium DPI for high-res preview (balance between quality and speed)
            zoom = STANDARD_DPI / 72
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
            
            # Use high DPI for final output
            zoom = FINAL_TIFF_DPI / 72
            mat = fitz.Matrix(zoom, zoom)
            
            # Convert coordinates using the same logic as crop_pdf_page
            reference_zoom = HIGH_DPI / 72
            pdf_crop_x = crop_x / reference_zoom
            pdf_crop_y = crop_y / reference_zoom
            pdf_crop_width = crop_width / reference_zoom
            pdf_crop_height = crop_height / reference_zoom
            
            rect = fitz.Rect(pdf_crop_x, pdf_crop_y, pdf_crop_x + pdf_crop_width, pdf_crop_y + pdf_crop_height)
            
            print(f"[Server] Merging PDF: file={file_id}, page={page_number}")
            print(f"[Server] PDF dims: {pdf_width}x{pdf_height}")
            print(f"[Server] Input crop: x={crop_x}, y={crop_y}, w={crop_width}, h={crop_height}")
            print(f"[Server] PDF crop rect: {rect}")
            print(f"[Server] Final DPI: {FINAL_TIFF_DPI}, zoom: {zoom}")
            
            # Validate crop area against PDF dimensions
            if rect.x0 < 0 or rect.y0 < 0:
                doc.close()
                raise HTTPException(status_code=400, detail=f"Crop area starts outside page boundaries: rect={rect}")
            
            if rect.x1 > pdf_width or rect.y1 > pdf_height:
                doc.close()
                print(f"[Server] Crop exceeds page: rect.x1={rect.x1} > pdf_width={pdf_width} or rect.y1={rect.y1} > pdf_height={pdf_height}")
                raise HTTPException(status_code=400, detail=f"Crop area exceeds page dimensions: rect={rect}, pdf_dims={pdf_width}x{pdf_height}")
            
            pix = page.get_pixmap(matrix=mat, clip=rect)
            
            if pix.width <= 0 or pix.height <= 0:
                doc.close()
                raise HTTPException(status_code=400, detail=f"Invalid crop resulted in zero-sized image: {pix.width}x{pix.height}")
            
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img_width, img_height = img.size

            if img_width <= 0 or img_height <= 0:
                print(f"[Server] Invalid image dimensions after cropping: {img_width}x{img_height}")
                raise HTTPException(status_code=400, detail="Invalid crop dimensions")

            # Resize to final TIFF dimensions for better quality
            cropped_img = img.resize((FINAL_TIFF_WIDTH, FINAL_TIFF_HEIGHT), Image.Resampling.LANCZOS)
            
            # Apply high-quality enhancement for final output
            cropped_img = apply_image_enhancement(cropped_img, is_final_output=True)
            
            images.append(cropped_img)
            doc.close()
        except Exception as e:
            print(f"[Server] Error processing PDF {file_id} page {page_number}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")

    # Create merged image with higher resolution
    merged_img = Image.new("1", (FINAL_TIFF_WIDTH * 2, FINAL_TIFF_HEIGHT), color=1)
    x_offset = 0
    for img in images:
        merged_img.paste(img, (x_offset, 0))
        x_offset += img.width

    pdf_names = [sanitize_filename(file_data["file_id"].split("_")[0]) for file_data in files]
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    tiff_filename = f"AusNet_{pdf_names[0]}_{pdf_names[1]}_{timestamp}.tiff"
    tiff_path = CROP_DIR / tiff_filename

    # Save with optimal settings for AutoCAD
    merged_img.save(
        tiff_path, 
        format="TIFF", 
        compression="tiff_lzw",  # LZW compression for good quality/size balance
        dpi=(FINAL_TIFF_DPI, FINAL_TIFF_DPI),
        # Additional TIFF options for better AutoCAD compatibility
        tiffinfo={
            317: 2,  # Predictor for better compression
            278: FINAL_TIFF_HEIGHT,  # RowsPerStrip
        }
    )

    response = {"tiff_file": f"/crops/{tiff_filename}"}
    print(f"[Server] Merge response: {response}")
    print(f"[Server] Merged TIFF details: mode={merged_img.mode}, size={merged_img.size}, dpi={FINAL_TIFF_DPI}")
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