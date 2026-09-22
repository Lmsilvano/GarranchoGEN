import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";

interface ReviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { id } = await params;
  return <ReviewWorkspace documentId={id} />;
}
