import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import ytdl from "@distube/ytdl-core";

// TODO FAZER BAIXAR COM QUALIDADE BOA

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  async downloadMultipleVideo(querystring: {urls: string, format?: string}): Promise<string> {
    try {    
      const urls = querystring.urls.split(',');
      for (const url of urls) {
        // Get video info
        let videoTitle = ';'
        await ytdl.getBasicInfo(url).then(info => {
          console.log(info.videoDetails.title);
          videoTitle = info.videoDetails.title.trim().replace(/[^a-zA-Z0-9]/g, "_");
        });

        // Download a video
        await ytdl(url).pipe(require("fs").createWriteStream(`${videoTitle}.mp4`));
      }

      return new Promise((resolve, reject) => {
        return resolve('success');
      })
    } catch (error) {
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }

  async downloadVideo(querystring: {url: string, quality?: string}): Promise<string> {
    try {
          const { quality } = querystring;
          // Get video info
          let videoTitle = ';'
          await ytdl.getBasicInfo(querystring.url).then(info => {
            console.log(info.videoDetails.title);
            videoTitle = info.videoDetails.title.trim().replace(/[^a-zA-Z0-9]/g, "_");
          });

          // Download a video
          await ytdl(querystring.url, { quality: quality || 'highest' }).pipe(require("fs").createWriteStream(`${videoTitle}.mp4`));

          // Get video info with download formats
          // ytdl.getInfo("http://www.youtube.com/watch?v=aqz-KE-bpKQ").then(info => {
          //   console.log(info.formats);
          // });

          return new Promise((resolve, reject) => {
            return resolve('success');
          })
    } catch (error) {
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }
}
