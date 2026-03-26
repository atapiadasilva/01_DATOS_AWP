'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera, Upload, X, Calendar, MapPin, Trash2, Loader2,
  Image as ImageIcon, Plus, ChevronDown, ChevronUp
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface CWPPhoto {
  id: string;
  cwp_name: string;
  discipline?: string;
  url: string;
  storage_path?: string;
  area: string;
  date: string;
  description?: string;
  created_at: string;
}

interface CWPPhotoGalleryProps {
  cwpName: string;
  discipline: string;
}

export default function CWPPhotoGallery({ cwpName, discipline }: CWPPhotoGalleryProps) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<CWPPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [area, setArea] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<CWPPhoto | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPhotos();
  }, [cwpName]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cwp_photos')
        .select('*')
        .eq('cwp_name', cwpName)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (!error && data) setPhotos(data as CWPPhoto[]);
    } catch (e) {
      console.error('Error loading photos:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setSelectedFiles(files);
    const urls = files.map(f => URL.createObjectURL(f));
    setPreviewUrls(prev => {
      prev.forEach(u => URL.revokeObjectURL(u));
      return urls;
    });
    setUploadError('');
  };

  const removePreview = (idx: number) => {
    URL.revokeObjectURL(previewUrls[idx]);
    setPreviewUrls(prev => prev.filter((_, i) => i !== idx));
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) return;
    setUploading(true);
    setUploadError('');
    try {
      for (const file of selectedFiles) {
        const safeCwp = cwpName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `${safeCwp}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;

        // Upload to Supabase Storage
        const { error: storageError } = await supabase.storage
          .from('FOTOS')
          .upload(fileName, file, { cacheControl: '3600', upsert: false });

        if (storageError) {
          console.error('Storage error:', storageError);
          setUploadError(`Error: ${storageError.message}. Verifica que el bucket "FOTOS" exista en Supabase Storage.`);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('FOTOS')
          .getPublicUrl(fileName);

        await supabase.from('cwp_photos').insert({
          cwp_name: cwpName,
          discipline,
          url: publicUrl,
          storage_path: fileName,
          area: area.trim() || 'General',
          date: selectedDate,
          description: description.trim() || null,
          uploaded_by: user?.id || null,
        });
      }

      // Reset form
      previewUrls.forEach(u => URL.revokeObjectURL(u));
      setSelectedFiles([]);
      setPreviewUrls([]);
      setDescription('');
      setShowUpload(false);
      loadPhotos();
    } catch (e) {
      console.error('Upload error:', e);
      setUploadError('Error al subir las fotos. Intenta nuevamente.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo: CWPPhoto) => {
    if (!confirm('¿Eliminar esta foto?')) return;
    try {
      if (photo.storage_path) {
        await supabase.storage.from('FOTOS').remove([photo.storage_path]);
      }
      await supabase.from('cwp_photos').delete().eq('id', photo.id);
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      if (selectedPhoto?.id === photo.id) setSelectedPhoto(null);
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const navigatePhoto = (dir: 'prev' | 'next') => {
    if (!selectedPhoto) return;
    const idx = photos.findIndex(p => p.id === selectedPhoto.id);
    const newIdx = dir === 'prev' ? idx - 1 : idx + 1;
    if (newIdx >= 0 && newIdx < photos.length) setSelectedPhoto(photos[newIdx]);
  };

  // Group by date
  const groupedPhotos = photos.reduce<Record<string, CWPPhoto[]>>((acc, photo) => {
    const key = photo.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(photo);
    return acc;
  }, {});

  const formatDate = (dateStr: string) =>
    new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 bg-brand-orange rounded-full shadow-[0_0_8px_rgba(255,152,0,0.5)]" />
          <h4 className="text-xl font-black italic text-brand-deep">Evidencia Fotográfica</h4>
          <span className="text-[9px] font-black text-brand-slate/30 uppercase tracking-widest">
            {photos.length} foto{photos.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => { setShowUpload(v => !v); setUploadError(''); }}
          className="px-4 py-2 bg-brand-deep text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-brand-electric transition-all shadow-lg shadow-brand-deep/20"
        >
          <Camera size={12} />
          {showUpload ? 'Cancelar' : 'Subir Fotos'}
        </button>
      </div>

      {/* ── Upload panel ── */}
      {showUpload && (
        <div className="bg-white rounded-[2rem] border border-brand-cloud p-7 shadow-lg space-y-5">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nueva Evidencia — {cwpName}</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[9px] uppercase font-black text-brand-slate/50 mb-1.5 tracking-widest">Fecha</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full p-2.5 bg-brand-cloud border border-white/50 rounded-xl text-xs font-bold outline-none focus:border-brand-electric transition-all"
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase font-black text-brand-slate/50 mb-1.5 tracking-widest">Área / Zona</label>
              <input
                type="text"
                value={area}
                onChange={e => setArea(e.target.value)}
                placeholder="Ej: Zona Norte, Nivel -3, Eje A..."
                className="w-full p-2.5 bg-brand-cloud border border-white/50 rounded-xl text-xs font-bold outline-none focus:border-brand-electric transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[9px] uppercase font-black text-brand-slate/50 mb-1.5 tracking-widest">Descripción</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe lo que muestra la fotografía..."
              className="w-full p-2.5 bg-brand-cloud border border-white/50 rounded-xl text-xs font-bold outline-none focus:border-brand-electric transition-all"
            />
          </div>

          {/* Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-brand-cloud hover:border-brand-electric rounded-[1.5rem] p-10 flex flex-col items-center gap-3 cursor-pointer transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-brand-cloud flex items-center justify-center group-hover:bg-brand-electric/10 transition-colors">
              <Camera size={22} className="text-slate-300 group-hover:text-brand-electric transition-colors" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seleccionar imágenes</p>
            <p className="text-[9px] text-slate-300 font-bold">JPG, PNG, HEIC, WEBP — múltiples archivos</p>
            <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleFileSelect} className="hidden" />
          </div>

          {/* Previews */}
          {previewUrls.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {previewUrls.map((url, i) => (
                <div key={i} className="relative aspect-square">
                  <img src={url} alt="" className="w-full h-full object-cover rounded-xl shadow-md" />
                  <button
                    onClick={() => removePreview(i)}
                    className="absolute top-1.5 right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow hover:bg-red-600 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadError && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-[10px] font-bold text-red-500">{uploadError}</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowUpload(false); setSelectedFiles([]); previewUrls.forEach(u => URL.revokeObjectURL(u)); setPreviewUrls([]); }}
              className="px-4 py-2 text-slate-400 font-black text-[10px] uppercase hover:text-slate-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpload}
              disabled={!selectedFiles.length || uploading}
              className="px-6 py-2.5 bg-brand-deep text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-brand-electric transition-all disabled:opacity-40 shadow-lg shadow-brand-deep/20"
            >
              {uploading
                ? <><Loader2 size={12} className="animate-spin" /> Subiendo...</>
                : <><Upload size={12} /> Guardar ({selectedFiles.length})</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Gallery ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-brand-electric" size={28} />
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-5 opacity-30">
          <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center">
            <Camera size={40} className="text-slate-200" />
          </div>
          <div className="text-center">
            <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Sin evidencia fotográfica</p>
            <p className="text-[9px] text-slate-300 font-bold mt-1">Sube fotos del área para documentar el avance</p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedPhotos).map(([date, datePhotos]) => (
            <div key={date} className="space-y-3">
              {/* Date header */}
              <div className="flex items-center gap-3">
                <Calendar size={12} className="text-brand-electric shrink-0" />
                <span className="text-[10px] font-black text-brand-slate/50 uppercase tracking-widest capitalize">
                  {formatDate(date)}
                </span>
                <div className="flex-1 h-px bg-brand-cloud" />
                <span className="text-[9px] text-slate-300 font-bold">{datePhotos.length} foto{datePhotos.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Photo grid */}
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {datePhotos.map(photo => (
                  <div
                    key={photo.id}
                    className="group relative aspect-square cursor-pointer"
                    onClick={() => setSelectedPhoto(photo)}
                  >
                    <img
                      src={photo.url}
                      alt={photo.description || photo.area}
                      className="w-full h-full object-cover rounded-2xl shadow-md transition-transform group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity flex flex-col justify-end p-2.5">
                      <div className="flex items-center gap-1">
                        <MapPin size={8} className="text-white/70 shrink-0" />
                        <p className="text-[9px] font-black text-white truncate">{photo.area}</p>
                      </div>
                      {photo.description && (
                        <p className="text-[8px] text-white/60 truncate mt-0.5">{photo.description}</p>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(photo); }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow print:hidden"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Lightbox ── */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-6"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-5xl max-h-full flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Calendar size={11} className="text-white/40" />
                  <span className="text-[10px] font-black text-white/60">{formatDate(selectedPhoto.date)}</span>
                </div>
                <span className="text-white/20">·</span>
                <div className="flex items-center gap-1.5">
                  <MapPin size={11} className="text-white/40" />
                  <span className="text-[10px] font-black text-white/60">{selectedPhoto.area}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigatePhoto('prev')}
                  disabled={photos.findIndex(p => p.id === selectedPhoto.id) === 0}
                  className="w-8 h-8 bg-white/10 text-white rounded-xl flex items-center justify-center hover:bg-white/20 disabled:opacity-30 transition-colors"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => navigatePhoto('next')}
                  disabled={photos.findIndex(p => p.id === selectedPhoto.id) === photos.length - 1}
                  className="w-8 h-8 bg-white/10 text-white rounded-xl flex items-center justify-center hover:bg-white/20 disabled:opacity-30 transition-colors"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  onClick={() => setSelectedPhoto(null)}
                  className="w-8 h-8 bg-white/10 text-white rounded-xl flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <img
              src={selectedPhoto.url}
              alt={selectedPhoto.description || selectedPhoto.area}
              className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl"
            />

            {selectedPhoto.description && (
              <p className="text-sm text-white/60 text-center font-medium">{selectedPhoto.description}</p>
            )}

            <p className="text-[9px] font-black text-white/20 text-center uppercase tracking-widest">
              {photos.findIndex(p => p.id === selectedPhoto.id) + 1} / {photos.length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
