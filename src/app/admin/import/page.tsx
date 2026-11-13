import { ImportUsers } from "./import-users";

export const instant = false;

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-5">
      <ImportUsers />
    </div>
  );
}
