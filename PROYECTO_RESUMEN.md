# 🐉 Spruce Spirit Photobooth: Resumen del Proyecto

Este documento resume la arquitectura, tecnologías y características clave de la herramienta "Spruce Spirit Photobooth", ideal para presentaciones de portafolio y documentación técnica.

## 📝 Descripción
Spruce Spirit Photobooth es una aplicación web interactiva que utiliza Inteligencia Artificial Generativa para transformar fotos de usuarios en avatares de dragones con estilo de animación 3D (Pixar). El proyecto destaca por su enfoque en la estética visual y la integración de servicios en la nube para una experiencia de usuario fluida y persistente.

## 🛠️ Stack Tecnológico

### Frontend
- **HTML5 & CSS3**: Diseño customizado con enfoque en *Glassmorphism*, gradientes vibrantes y animaciones micro-interactivas.
- **JavaScript (Vanilla)**: Lógica de cliente sin dependencias pesadas, gestionada con **Vite** para una carga ultrarrápida.
- **Responsive Design**: Adaptación específica para móviles basada en diseños de alta fidelidad (Figma).

### Backend
- **Node.js & Express**: Servidor robusto que actúa como puente entre el cliente y los servicios de IA/Datos.
- **Multer & FS**: Manejo de buffers de imagen y almacenamiento temporal.

## 🔌 Integración de APIs y Servicios Cloud

1. **Replicate (IA Generativa)**:
   - Uso del modelo **xAI Grok Imagine** para la transformación de imagen a imagen.
   - Configuración de prompts cinemáticos para asegurar un estilo visual consistente y de alta calidad.

2. **Supabase (Backend-as-a-Service)**:
   - **Base de Datos**: Almacenamiento de registros de la galería con sincronización en tiempo real.
   - **Storage**: Bucket de almacenamiento persistente para las imágenes generadas, evitando la pérdida de datos en despliegues efímeros.

3. **Render (Despliegue)**:
   - Hosting automatizado con soporte para variables de entorno y despliegue continuo desde GitHub.

## ✨ Características Principales
- **Dragon Transformation**: Procesamiento de IA con filtros aleatorios (Fiesta, Bosque, Templo) y cuenta regresiva interactiva.
- **Galería Inteligente**: Cuadrícula de 4 columnas optimizada con persistencia en la nube.
- **Social & Tools**: Botones integrados de "Like" (interacción visual) y "Descarga" (gestión de archivos blobs).
- **Admin Secret Mode**: Sistema de moderación oculto activado por parámetros de URL (`?admin=spruce`) para el borrado seguro de contenido.
- **Seguridad**: Implementación de políticas RLS (Row Level Security) y permisos de almacenamiento en Supabase.

---
*Proyecto desarrollado con un enfoque en la excelencia visual y la robustez técnica.*
