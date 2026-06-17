/**
 * Pipeline360 — fotos-v1.js
 * Compresión de imágenes en el cliente antes de subirlas al libro de obra.
 *  - Redimensiona a un máximo de 1920px en el lado más largo
 *  - Convierte a JPEG calidad 80%
 *  - Si la imagen ya es chica/liviana (<400KB y <=1920px), no la toca
 *  - Si la compresión no reduce el tamaño, sube la original
 *
 * Las fotos quedan en Supabase Storage (bucket "project-log-attachments"),
 * almacenamiento permanente — no es temporal.
 */
(function () {
  'use strict';

  const MAX_SIDE = 1920;
  const QUALITY = 0.8;
  const SKIP_UNDER = 400 * 1024; // 400 KB

  window._p360compressImage = function (file) {
    return new Promise((resolve) => {
      if (!file || !file.type || !file.type.startsWith('image/')) return resolve(file);
      // GIFs animados: no tocar
      if (file.type === 'image/gif') return resolve(file);

      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return resolve(file);

        const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
        // Ya es chica y liviana → dejar como está
        if (scale >= 1 && file.size < SKIP_UNDER) return resolve(file);

        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob((blob) => {
          if (!blob || blob.size >= file.size) return resolve(file);
          const name = file.name.replace(/\.(png|webp|heic|heif|bmp|tiff?|jpeg|jpg)$/i, '') + '.jpg';
          try {
            resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
          } catch (e) {
            // Safari viejo sin constructor File
            blob.name = name;
            resolve(blob);
          }
        }, 'image/jpeg', QUALITY);
      };

      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  };
})();
