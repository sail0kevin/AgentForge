import { NextResponse } from "next/server";
import { demoWorkspace } from "@/lib/demo-data";

export async function GET() {
  return NextResponse.json(demoWorkspace);
}
