"use client";

import { useState } from "react";

type File = { id: string; file_name: string };

/** Shows a card's PDFs in the page so the reviewer never leaves the card. */
export function PdfViewer({ files }: { files: File[] }) {
  const [i, setI] = useState(0);
  const file = files[Math.min(i, files.length - 1)];
  if (!file) {
    return <div className="flex min-h-[280px] items-center justify-center rounded-xl bg-[#F5F5F6] p-6 text-center text-sm font-semibold text-[#5B5F66]">No PDFs are attached to this card.</div>;
  }
  const src = `/cards/files/${file.id}`;
  return (
    <div className="flex flex-col gap-3">
      {files.length > 1 && (
        <div role="tablist" aria-label="Files" className="flex flex-wrap gap-1.5 rounded-xl bg-[#F0F0F2] p-1">
          {files.map((f, n) => (
            <button key={f.id} type="button" role="tab" aria-selected={n === i} onClick={() => setI(n)}
              className={`h-[38px] min-w-0 flex-1 cursor-pointer truncate rounded-[9px] px-3 text-[13px] font-semibold ${n === i ? "bg-[#111214] text-white" : "text-[#3A3D42] hover:bg-white/70"}`}>{f.file_name}</button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-[13px] text-[#5B5F66]">
        <span className="min-w-0 truncate font-semibold">{file.file_name}</span>
        <a href={src} target="_blank" rel="noreferrer" className="h-[30px] shrink-0 rounded-lg border border-[#CFD1D6] bg-white px-2.5 text-xs font-semibold leading-[28px] !text-[#111214] hover:bg-[#F5F5F6]">Open in new tab</a>
      </div>
      <iframe key={file.id} src={src} title={file.file_name} className="h-[640px] w-full rounded-xl border border-[#E6E7EA] bg-[#DCDEE2]" />
    </div>
  );
}
