-- CreateTable
CREATE TABLE "auto_assignment_preview_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conference_house_id" TEXT NOT NULL,
    "building_ids" TEXT[],
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_assignment_preview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_assignment_preview_sessions_conference_house_id_key" ON "auto_assignment_preview_sessions"("conference_house_id");

-- CreateIndex
CREATE INDEX "auto_assignment_preview_sessions_organization_id_idx" ON "auto_assignment_preview_sessions"("organization_id");

-- AddForeignKey
ALTER TABLE "auto_assignment_preview_sessions" ADD CONSTRAINT "auto_assignment_preview_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_assignment_preview_sessions" ADD CONSTRAINT "auto_assignment_preview_sessions_conference_house_id_fkey" FOREIGN KEY ("conference_house_id") REFERENCES "conference_houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_assignment_preview_sessions" ADD CONSTRAINT "auto_assignment_preview_sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
