# PixPlot

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.68+-green.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)](https://reactjs.org/)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/yourusername/pixplot/graphs/commit-activity)

> A professional PDF to TIFF conversion tool designed for seamless AutoCAD template integration.

## Overview

PixPlot is a robust web-based application that streamlines the conversion of PDF documents to high-quality TIFF images, specifically designed for integration with AutoCAD workflows. Originally developed by the IBM Data Maintenance Team, this tool addresses the common challenges faced when importing engineering and architectural documents into CAD environments.

## Features

- **📤 PDF Upload**: Secure file upload with validation and error handling
- **✂️ Page Management**: Crop, rotate, and combine PDF pages with precision
- **🖼️ High-Quality Conversion**: Generate professional-grade TIFF images optimized for CAD use
- **📥 Batch Download**: Download processed files individually or in bulk
- **⚙️ CAD Integration**: Seamless compatibility with AutoCAD templates and workflows
- **🔄 Real-time Processing**: Live preview and progress tracking during conversion

## Technology Stack

### Frontend
- **React.js** - Modern, component-based user interface
- **HTML5/CSS3** - Responsive design with modern styling
- **JavaScript ES6+** - Enhanced user interactions and file handling

### Backend
- **FastAPI** - High-performance Python web framework
- **Python 3.8+** - Core application logic and PDF processing

### Dependencies
```
fastapi>=0.68.0
pypdf>=3.0.0
pdf2image>=3.1.0
Pillow>=9.0.0
PyMuPDF>=1.20.0
pydantic>=1.8.0
python-multipart>=0.0.5
uvicorn[standard]>=0.15.0
```

## Installation

### Prerequisites
- Python 3.8 or higher
- Node.js 14+ (for frontend development)
- Virtual environment (recommended)

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/pixplot.git
   cd pixplot
   ```

2. **Create and activate virtual environment**
   ```bash
   python -m venv venv
   
   # On Windows
   venv\Scripts\activate
   
   # On macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the FastAPI server**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm start
   ```

## Usage

1. **Upload PDF**: Select and upload your PDF document through the web interface
2. **Configure Pages**: Use the cropping tools to select specific areas and combine pages as needed
3. **Process**: Initiate the conversion process with your desired TIFF quality settings
4. **Download**: Retrieve the processed TIFF files for immediate use in AutoCAD

## API Documentation

Once the backend server is running, visit `http://localhost:8000/docs` for interactive API documentation powered by Swagger UI.

## Configuration

Create a `.env` file in the root directory for environment-specific settings:

```
## Roadmap

- [ ] **Enhanced Preview System** - Zoom and pan capabilities for better page inspection
- [ ] **Multi-page TIFF Support** - Generate single TIFF files containing multiple pages
- [ ] **Batch Processing** - Handle multiple PDF files simultaneously
- [ ] **Advanced Cropping Tools** - Polygon selection and automated border detection
- [ ] **Cloud Storage Integration** - Support for AWS S3, Google Drive, and Dropbox
- [ ] **CI/CD Pipeline** - Automated testing and deployment workflows
- [ ] **Docker Support** - Containerized deployment options

## Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting pull requests.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **IBM Data Maintenance Team** - Original concept and requirements
- **FastAPI Community** - Excellent framework and documentation
- **React Community** - Frontend framework and ecosystem

## Support

For support, please open an issue on GitHub or contact the development team.

---

**Made with ❤️ [Yogesh](https://github.com/Yogesh0808)**

---