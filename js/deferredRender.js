(function() {
    'use strict';
    // deferredSetup.js must be loaded first
    var prev_matrix;

    R.deferredRender = function(state) {
        if (!aborted && (
            !R.progCopy ||
            !R.progRed ||
            !R.progClear ||
            !R.prog_Ambient ||
            !R.prog_BlinnPhong_PointLight ||
            !R.prog_Debug ||
            !R.progPost1 ||
            !R.progScissor||
            !R.progToon||
            !R.progMotion||
            !R.progbloomextract||
            !R.progbloomblur||
            !R.progbloomblurtwice)) {
            console.log('waiting for programs to load...');
            return;
        }

        // Move the R.lights
        for (var i = 0; i < R.lights.length; i++) {
            // OPTIONAL TODO: Edit if you want to change how lights move
            var mn = R.light_min[1];
            var mx = R.light_max[1];
            R.lights[i].pos[1] = (R.lights[i].pos[1] + R.light_dt - mn + mx) % mx + mn;
        }

        // Execute deferred shading pipeline

        // CHECKITOUT: START HERE! You can even uncomment this:
        //debugger;

/*
        { // TODO: this block should be removed after testing renderFullScreenQuad
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            // TODO: Implement/test renderFullScreenQuad first
            renderFullScreenQuad(R.progRed);
            return;
        }
*/
        R.pass_copy.render(state);
        if (cfg && cfg.debugScissor == true) {
           // if I not put is here, debugScissor will never be executed
            R.pass_debug.renderScissor(state);
        } else if(cfg && cfg.debugView >= 0) {
            R.pass_debug.render(state); //if do not adjust, will never come in this
            // * Deferred pass and postprocessing pass(es)
            // TODO: uncomment these
        } else {
            R.pass_deferred.render(state);
            if(cfg.bloom == true) {
          	  	R.pass_bloomextract.render(state);
                R.pass_bloomblur.render(state);
                R.pass_bloomblurtwice.render(state);
            } else if(cfg.toon == true) {
                R.pass_toon.render(state);
            } else if(cfg.motion == true) {
                R.pass_motion.render(state);
            } else {
                R.pass_post1.render(state);
            }
            // OPTIONAL TODO: call more postprocessing passes, if any
            // add bloom here
            // R.pass_bloomextract.render(state);
            // R.pass_bloomblur.render(state);
            // R.pass_bloomblurtwice.render(state);

        //    R.pass_post1.render(state);
        }
    };

    /**
     * 'copy' pass: Render into g-buffers
     */
    R.pass_copy.render = function(state) {
        // * Bind the framebuffer R.pass_copy.fbo
        // TODO: uncomment
        gl.bindFramebuffer(gl.FRAMEBUFFER,R.pass_copy.fbo);
        // * Clear screen using R.progClear
        // TODO: uncomment
        renderFullScreenQuad(R.progClear);

        // * Clear depth buffer to value 1.0 using gl.clearDepth and gl.clear
        // TODO: uncomment
        gl.clearDepth(1.0);
        gl.clear(gl.DEPTH_BUFFER_BIT);

        // * "Use" the program R.progCopy.prog
        // TODO: uncomment
        gl.useProgram(R.progCopy.prog);

        // TODO: Go write code in glsl/copy.frag.glsl
        // OK!

        var m = state.cameraMat.elements;
        // * Upload the camera matrix m to the uniform R.progCopy.u_cameraMat
        //   using gl.uniformMatrix4fv
        // TODO: uncomment
        gl.uniformMatrix4fv(R.progCopy.u_cameraMat, false, m);

        // * Draw the scene
        // TODO: uncomment
        drawScene(state);
    };

    var drawScene = function(state) {
        for (var i = 0; i < state.models.length; i++) {
            var m = state.models[i];

            // If you want to render one model many times, note:
            // readyModelForDraw only needs to be called once.
            readyModelForDraw(R.progCopy, m);

            drawReadyModel(m);
        }
    };

    R.pass_debug.render = function(state) {
        // * Unbind any framebuffer, so we can write to the screen
        // TODO: uncomment
         gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // * Bind/setup the debug "lighting" pass
        // * Tell shader which debug view to use
        // TODO: uncomment
         bindTexturesForLightPass(R.prog_Debug);
         gl.uniform1i(R.prog_Debug.u_debug, cfg.debugView);
        // // * Render a fullscreen quad to perform shading on
        // TODO: uncomment
         renderFullScreenQuad(R.prog_Debug);
    };

//try another way
   R.pass_debug.renderScissor = function(state) {
        //put it at screen
         gl.bindFramebuffer(gl.FRAMEBUFFER, null);
         // * Clear depth to 1.0 and color to black
         gl.clearColor(0.0, 0.0, 0.0, 0.0);
         gl.clearDepth(1.0);
         gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

//https://www.opengl.org/sdk/docs/man/html/glBlendFunc.xhtml
         gl.enable(gl.BLEND);
         gl.blendEquation( gl.FUNC_ADD );
         gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

         gl.enable(gl.SCISSOR_TEST);

         for (var light of R.lights) {
            var sc = getScissorForLight(state.viewMat, state.projMat, light);
            if (sc == null) {continue;}
            gl.scissor(sc[0], sc[1], sc[2], sc[3]);
            renderFullScreenQuad(R.progScissor);
          }
         gl.disable(gl.BLEND);
         gl.disable(gl.SCISSOR_TEST);
     };

    /**
     * 'deferred' pass: Add lighting results for each individual light
     */
    R.pass_deferred.render = function(state) {
        // * Bind R.pass_deferred.fbo to write into for later postprocessing
        gl.bindFramebuffer(gl.FRAMEBUFFER, R.pass_deferred.fbo);

        // * Clear depth to 1.0 and color to black
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // * _ADD_ together the result of each lighting pass

        // Enable blending and use gl.blendFunc to blend with:
        //   color = 1 * src_color + 1 * dst_color
        // Here is a wonderful demo of showing how blend function works:
        // http://mrdoob.github.io/webgl-blendfunctions/blendfunc.html
        // TODO: uncomment
        gl.enable(gl.BLEND);
        gl.blendEquation( gl.FUNC_ADD );
        gl.blendFunc(gl.ONE,gl.ONE);

        // * Bind/setup the ambient pass, and render using fullscreen quad
        bindTexturesForLightPass(R.prog_Ambient);
        renderFullScreenQuad(R.prog_Ambient);

        gl.enable(gl.SCISSOR_TEST);
        // * Bind/setup the Blinn-Phong pass, and render using fullscreen quad
        bindTexturesForLightPass(R.prog_BlinnPhong_PointLight);
        // TODO: In the lighting loop, use the scissor test optimization
        // Enable gl.SCISSOR_TEST, render all lights, then disable it.

        // TODO: add a loop here, over the values in R.lights, which sets the
        //   uniforms R.prog_BlinnPhong_PointLight.u_lightPos/Col/Rad etc.,
        //   then does renderFullScreenQuad(R.prog_BlinnPhong_PointLight).
        for (var light of R.lights) {
          	var l = light;
            var sc = getScissorForLight(state.viewMat, state.projMat, light);
            if(sc != null) {
               gl.scissor(sc[0],sc[1],sc[2],sc[3]);
             }
            var eye = [state.cameraPos.x,state.cameraPos.y,state.cameraPos.z];
            gl.uniform3fv(R.prog_BlinnPhong_PointLight.u_camPos,eye);
            gl.uniform3fv(R.prog_BlinnPhong_PointLight.u_lightPos, l.pos);
            gl.uniform3fv(R.prog_BlinnPhong_PointLight.u_lightCol, l.col);
            gl.uniform1f(R.prog_BlinnPhong_PointLight.u_lightRad,l.rad);
            if (cfg.toon) {
               gl.uniform1f(R.prog_BlinnPhong_PointLight.u_toon, 1.0);
            } else {
               gl.uniform1f(R.prog_BlinnPhong_PointLight.u_toon, 0.0);
            }
            renderFullScreenQuad(R.prog_BlinnPhong_PointLight);
        }
        // Disable blending so that it doesn't affect other code
         gl.disable(gl.SCISSOR_TEST);
         gl.disable(gl.BLEND);
    };

    var bindTexturesForLightPass = function(prog) {
        gl.useProgram(prog.prog);

        // * Bind all of the g-buffers and depth buffer as texture uniform
        //   inputs to the shader
        for (var i = 0; i < R.NUM_GBUFFERS; i++) {
            gl.activeTexture(gl['TEXTURE' + i]);
            gl.bindTexture(gl.TEXTURE_2D, R.pass_copy.gbufs[i]);
            gl.uniform1i(prog.u_gbufs[i], i);
        }
        gl.activeTexture(gl['TEXTURE' + R.NUM_GBUFFERS]);
        gl.bindTexture(gl.TEXTURE_2D, R.pass_copy.depthTex);
        gl.uniform1i(prog.u_depth, R.NUM_GBUFFERS);
    };

    /**
     * 'post1' pass: Perform (first) pass of post-processing
     */
    R.pass_post1.render = function(state) {
        // * Unbind any existing framebuffer (if there are no more passes)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // * Clear the framebuffer depth to 1.0
        gl.clearDepth(1.0);
        gl.clear(gl.DEPTH_BUFFER_BIT);

        // * Bind the postprocessing shader program
        gl.useProgram(R.progPost1.prog);

        // * Bind the deferred pass's color output as a texture input
        // Set gl.TEXTURE0 as the gl.activeTexture unit
        // TODO: uncomment
        gl.activeTexture(gl.TEXTURE0);

        // Bind the TEXTURE_2D, R.pass_deferred.colorTex to the active texture unit
        // TODO: uncomment
        gl.bindTexture(gl.TEXTURE_2D, R.pass_deferred.colorTex);
        //gl.bindTexture(gl.TEXTURE_2D, R.pass_bloomblurtwice.colorTex);

        // Configure the R.progPost1.u_color uniform to point at texture unit 0
        gl.uniform1i(R.progPost1.u_color, 0);

        // * Render a fullscreen quad to perform shading on
        renderFullScreenQuad(R.progPost1);
    };

    R.pass_motion.render = function(state) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearDepth(1.0);
        gl.clear(gl.DEPTH_BUFFER_BIT);
          // * Bind the postprocessing shader program
        gl.useProgram(R.progMotion.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, R.pass_deferred.colorTex);
        gl.uniform1i(R.progMotion.u_color, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, R.pass_copy.gbufs[0]);
        gl.uniform1i(R.progMotion.u_worldPos, 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, R.pass_copy.depthTex);
        gl.uniform1i(R.progMotion.u_depth, 2);

       if (prev_matrix !== undefined) {
        gl.uniformMatrix4fv(R.progMotion.u_prevProj, gl.FALSE, prev_matrix.elements);}
        var inverse_camMatrix = new THREE.Matrix4();
        inverse_camMatrix = inverse_camMatrix.getInverse(state.cameraMat);
        gl.uniform3f(R.progMotion.u_camPos, state.cameraPos[0], state.cameraPos[1], state.cameraPos[2]);
        gl.uniformMatrix4fv(R.progMotion.u_invMat, gl.FALSE, inverse_camMatrix.elements);
        prev_matrix = state.cameraMat.clone();
        renderFullScreenQuad(R.progMotion);
  }

    R.pass_toon.render = function(state) {
      // * Unbind any existing framebuffer (if there are no more passes)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // * Clear the framebuffer depth to 1.0
      gl.clearDepth(1.0);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      // * Bind the postprocessing shader program
      gl.useProgram(R.progToon.prog);
      // * Bind the deferred pass's color output as a texture input
      // Set gl.TEXTURE0 as the gl.activeTexture unit
      gl.activeTexture(gl.TEXTURE0);
      // Bind the TEXTURE_2D, R.pass_deferred.colorTex to the active texture unit
      gl.bindTexture(gl.TEXTURE_2D, R.pass_deferred.colorTex);
      // Configure the R.progPost1.u_color uniform to point at texture unit 0
      gl.uniform1i(R.progToon.u_color, 0);

      var tSize = [width,height];
      gl.uniform2fv(R.progToon.u_size, tSize);

      gl.activeTexture(gl['TEXTURE' + R.NUM_GBUFFERS]);
      gl.bindTexture(gl.TEXTURE_2D, R.pass_copy.depthTex);
      gl.uniform1i(R.progToon.u_depth, R.NUM_GBUFFERS);

      renderFullScreenQuad(R.progToon);

    };


   R.pass_bloomextract.render = function(state) {
      // * Unbind any existing framebuffer (if there are no more passes)
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.pass_bloomextract.fbo);

      // * Clear the framebuffer depth to 1.0
      gl.clearDepth(1.0);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      // * Bind the postprocessing shader program
      gl.useProgram(R.progbloomextract.prog);

      // * Bind the deferred pass's color output as a texture input
      // Set gl.TEXTURE0 as the gl.activeTexture unit

  	 gl.activeTexture(gl.TEXTURE0);
        // Bind the TEXTURE_2D, R.pass_deferred.colorTex to the active texture unit
     gl.bindTexture(gl.TEXTURE_2D, R.pass_deferred.colorTex);

      gl.uniform1i(R.progbloomextract.u_color, 0);
      renderFullScreenQuad(R.progbloomextract);
   }

    R.pass_bloomblur.render = function(state) {
      // * Unbind any existing framebuffer (if there are no more passes)
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.pass_bloomblur.fbo);

      // * Clear the framebuffer depth to 1.0
      gl.clearDepth(1.0);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      // * Bind the postprocessing shader program
      gl.useProgram(R.progbloomblur.prog);

      gl.activeTexture(gl.TEXTURE0);
      // Bind the TEXTURE_2D, R.pass_deferred.colorTex to the active texture unit
      gl.bindTexture(gl.TEXTURE_2D, R.pass_bloomextract.colorTex);

      gl.uniform1i(R.progbloomblur.u_color, 0);
   		var tSize = [width,height];
  		gl.uniform2fv(R.progbloomblur.u_texture,tSize);
         // * Render a fullscreen quad
      renderFullScreenQuad(R.progbloomblur);
    }

    R.pass_bloomblurtwice.render = function(state) {
      // * Unbind any existing framebuffer (if there are no more passes)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // * Clear the framebuffer depth to 1.0
      gl.clearDepth(1.0);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      // * Bind the postprocessing shader program
      gl.useProgram(R.progbloomblurtwice.prog);

      gl.activeTexture(gl.TEXTURE0);
         // Bind the TEXTURE_2D, R.pass_deferred.colorTex to the active texture unit
      gl.bindTexture(gl.TEXTURE_2D, R.pass_bloomblur.colorTex);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, R.pass_deferred.colorTex);

      gl.uniform1i(R.progbloomblurtwice.u_color, 0);
      gl.uniform1i(R.progbloomblurtwice.u_originalcolor, 1);
   		var tSize = [width,height];
  		gl.uniform2fv(R.progbloomblurtwice.u_texture,tSize);
         // * Render a fullscreen quad
      renderFullScreenQuad(R.progbloomblurtwice);
    }

    var renderFullScreenQuad = (function() {
        // The variables in this function are private to the implementation of
        // renderFullScreenQuad. They work like static local variables in C++.

        // Create an array of floats, where each set of 3 is a vertex position.
        // You can render in normalized device coordinates (NDC) so that the
        // vertex shader doesn't have to do any transformation; draw two
        // triangles which cover the screen over x = -1..1 and y = -1..1.
        // This array is set up to use gl.drawArrays with gl.TRIANGLE_STRIP.
        var positions = new Float32Array([
            -1.0, -1.0, 0.0,
             1.0, -1.0, 0.0,
            -1.0,  1.0, 0.0,
             1.0,  1.0, 0.0
        ]);

        var vbo = null;

        var init = function() {
            // Create a new buffer with gl.createBuffer, and save it as vbo.
            // TODO: uncomment
            vbo = gl.createBuffer();

            // Bind the VBO as the gl.ARRAY_BUFFER
            // TODO: uncomment
            gl.bindBuffer(gl.ARRAY_BUFFER,vbo);

            // Upload the positions array to the currently-bound array buffer
            // using gl.bufferData in static draw mode.
            // TODO: uncomment
            gl.bufferData(gl.ARRAY_BUFFER,positions,gl.STATIC_DRAW);
        };

        return function(prog) {
            if (!vbo) {
                // If the vbo hasn't been initialized, initialize it.
                init();
            }

            // Bind the program to use to draw the quad
            gl.useProgram(prog.prog);

            // Bind the VBO as the gl.ARRAY_BUFFER
            // TODO: uncomment
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

            // Enable the bound buffer as the vertex attrib array for
            // prog.a_position, using gl.enableVertexAttribArray
            // TODO: uncomment
            gl.enableVertexAttribArray(prog.a_position);

            // Use gl.vertexAttribPointer to tell WebGL the type/layout for
            // prog.a_position's access pattern.
            // TODO: uncomment
            gl.vertexAttribPointer(prog.a_position, 3, gl.FLOAT, gl.FALSE, 0, 0);

            // Use gl.drawArrays (or gl.drawElements) to draw your quad.
            // TODO: uncomment
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            // Unbind the array buffer.
        };
    })();
})();
