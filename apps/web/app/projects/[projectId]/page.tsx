import { ProjectEditor } from './project-editor'

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  return <ProjectEditor projectId={(await params).projectId} />
}
