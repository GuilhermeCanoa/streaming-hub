import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import ytdl from "@distube/ytdl-core";

// TODO FAZER BAIXAR COM QUALIDADE BOA

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  async downloadVideoYTDL(url:string, options: object): Promise<string> {
    try {
          // Get video info
          let videoTitle = ';'
          await ytdl.getBasicInfo(url).then(info => {
            console.log(info.videoDetails.title);
            videoTitle = info.videoDetails.title.trim().replace(/[^a-zA-Z0-9]/g, "_");
          });

          // Get video info with download formats
          await ytdl.getInfo(url).then(info => {
            console.log(info.formats);
          });

          // Download a video
          await ytdl(url, options).pipe(require("fs").createWriteStream(`${videoTitle}.mp4`));


          return new Promise((resolve, reject) => {
            return resolve('success');
          })
    }
    catch (error) {
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }

  async downloadMultipleVideo(querystring: {urls: string, quality?: string}): Promise<string> {
    try {    
      const urls = querystring.urls.split(',');
      const { quality } = querystring;
      const options = {
        quality,
      }
      for (const url of urls) {
        const response = await this.downloadVideoYTDL(url, options);
        console.log(url, response);
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
      const { url, quality } = querystring;
      const options = {
        quality,
      }
      const response = await this.downloadVideoYTDL(url, options);
      return new Promise((resolve, reject) => {
        return resolve(response);
      })
    } catch (error) {
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }
}
