import { MemberPhotoGallerySkeleton } from "@/features/members/components/MemberPhotoGallery";

export default function MembersLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="space-y-3">
        <div className="h-12 w-full animate-pulse rounded-xl bg-gray-100" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-gray-100" />
      </div>
      <MemberPhotoGallerySkeleton />
    </div>
  );
}
