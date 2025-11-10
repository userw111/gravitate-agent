import { ResolveTranscriptClient } from "./ResolveTranscriptClient";

type PageProps = {
  params: Promise<{
    transcriptId: string;
  }>;
};

export default async function ResolveTranscriptPage({ params }: PageProps) {
  const { transcriptId } = await params;
  return <ResolveTranscriptClient transcriptId={transcriptId} />;
}

