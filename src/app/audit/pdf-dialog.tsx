"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useAudit } from "./audit-context";
import { PdfViewer } from "./pdf-viewer";

/** A button that opens the card's PDF in a popup (optionally on one particular file). */
export function ViewPdfButton({ fileId, children, className }: { fileId?: string; children: ReactNode; className?: string }) {
  const { openPdf } = useAudit();
  return (
    <button type="button" onClick={() => openPdf(fileId)}
      className={className ?? "inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-[#111214] bg-[#111214] px-3.5 text-[13px] font-bold text-white hover:bg-[#2A2C31]"}>
      {children}
    </button>
  );
}

/** The card's PDFs in a large popup over the audit page. They load only when it is opened. */
export function PdfDialog({ files, title }: { files: { id: string; file_name: string }[]; title: string }) {
  const { pdf, closePdf, selectedId } = useAudit();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (pdf.open && !d.open) d.showModal();
    if (!pdf.open && d.open) d.close();
  }, [pdf.open]);

  return (
    <dialog ref={ref} aria-label="Contract PDF" onCancel={(e) => { e.preventDefault(); closePdf(); }}
      className="m-auto h-[min(94vh,1100px)] w-[min(1100px,96vw)] overflow-hidden rounded-[22px] bg-white p-0 text-[#111214] shadow-[0_18px_40px_rgba(17,18,20,0.16)] backdrop:bg-[#111214]/50 open:flex open:flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[#E6E7EA] px-5 py-3">
        <div className="min-w-0 truncate text-[15px] font-extrabold">{title}</div>
        <button type="button" onClick={closePdf} autoFocus
          className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-[10px] border border-[#111214] bg-white px-4 text-sm font-bold hover:bg-[#F5F5F6]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          Close
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {pdf.open && <PdfViewer key={`${selectedId}-${pdf.fileId ?? ""}`} files={files} initialId={pdf.fileId} />}
      </div>
    </dialog>
  );
}
